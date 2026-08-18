from playwright.sync_api import sync_playwright
import os, json
IDX=os.path.abspath('keystamp/index.html'); MOCK=open('tests/mock-supabase.js').read()
CFG="window.KEYSTAMP_SUPABASE_URL='https://mockproject.supabase.co';window.KEYSTAMP_SUPABASE_ANON_KEY='"+'ey'+'J'*60+"';"
R=[]
def ck(n,c,x=''): R.append((n,bool(c),x))
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context()
    pg=ctx.new_page(); pg.add_init_script(MOCK+CFG)
    pg.goto('file://'+IDX)
    pg.wait_for_function('typeof Store!=="undefined" && Store.ready===true', timeout=25000)

    # a member with 3 attendances across 3 meetings
    pg.evaluate("async()=>{AuthUI.mode='up'; await Store.signUp('alpha','hunter2222','hunter2222')}")
    pg.wait_for_function('Store.signedIn===true', timeout=15000)
    uid = pg.evaluate('Store.user.id')
    pg.evaluate("""(uid)=>{
      for(let i=1;i<=3;i++){
        window.__mockDB.meetings.push({id:'mg'+i,meeting_number:i,meeting_date:'2026-01-07',
          start_time:'3:15 PM',end_time:'4:15 PM',location:'MPR',check_in_open:false});
        window.__mockDB.attendance.push({id:'ag'+i,user_id:uid,meeting_id:'mg'+i,
          checked_in_at:new Date(Date.now()-i*3600000).toISOString(),verification_method:'qr'});
      }
      window.saveDB();
    }""", uid)
    pg.evaluate("async()=>await Store.hydrate()"); pg.wait_for_timeout(400)
    member_total = pg.evaluate('Store.totalStamps()')
    ck('member sees 3 stamps', member_total==3, str(member_total))

    # board view of the same facts
    pg.evaluate("""async()=>{
      await Store.signOut(); AuthUI.mode='up';
      await Store.signUp('bossman','hunter2222','hunter2222');
      window.__mockDB.profiles.find(p=>p.username==='bossman').role='board';
      window.saveDB(); await Store.hydrate();
    }""")
    pg.wait_for_function('Store.isBoard===true', timeout=15000)

    ov = pg.evaluate("async()=>await Backend.board('overview')")
    ms = pg.evaluate("async()=>await Backend.board('members',{q:'alpha',sort:'username',page:1})")
    det = pg.evaluate("async(id)=>await Backend.board('member',{id})", uid)
    mtg = pg.evaluate("async()=>await Backend.board('meeting',{id:'mg1'})")
    raw = pg.evaluate("window.__mockDB.attendance.length")

    ck('board total seals == all attendance rows', ov['total_seals']==raw, f"{ov['total_seals']} vs {raw}")
    ck('board member list count == member total', ms['members'][0]['stamps']==member_total,
       f"{ms['members'][0]['stamps']} vs {member_total}")
    ck('board member detail == member total', det['member']['stamps']==member_total,
       f"{det['member']['stamps']} vs {member_total}")
    ck('board detail history length matches', len(det['attendance'])==member_total)
    ck('meeting attendance count == rows for that meeting', len(mtg['attendees'])==1, json.dumps(mtg['attendees']))
    ck('attendee username matches member', mtg['attendees'][0]['username']=='alpha')
    ck('history newest first',
       [a['checked_in_at'] for a in det['attendance']] == sorted([a['checked_in_at'] for a in det['attendance']], reverse=True))
    ck('history shows MPR', all(a['location']=='MPR' for a in det['attendance']))
    ck('history meeting numbers real',
       sorted(a['meeting_number'] for a in det['attendance'])==[1,2,3],
       str([a['meeting_number'] for a in det['attendance']]))
    ck('no fabricated meetings', all(a['meeting_id'].startswith('mg') for a in det['attendance']))
    b.close()

ok=sum(1 for _,c,_ in R if c)
for n,c,x in R: print(('PASS ' if c else 'FAIL ')+n+((' <- '+str(x)[:80]) if (not c and x) else ''))
print(f"\n{ok}/{len(R)} passed")
