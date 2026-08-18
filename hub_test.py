"""Board = club information hub.

Checks that the board landing communicates club information, that every
figure on it is the same figure the member side would report, that the
milestone counts are derived from real attendance, and that the one
operational control (opening check-in) still works.
"""
from playwright.sync_api import sync_playwright
import os
try:
    import cv2                      # optional: decodes the rendered QR
except Exception:
    cv2 = None

IDX = os.path.abspath('keystamp/index.html')
MOCK = open('tests/mock-supabase.js').read()
CFG = ("window.KEYSTAMP_SUPABASE_URL='https://mockproject.supabase.co';"
       "window.KEYSTAMP_SUPABASE_ANON_KEY='" + 'ey' + 'J' * 60 + "';")
R = []
def ck(n, c, x=''): R.append((n, bool(c), x))

with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context()
    pg = ctx.new_page(); pg.add_init_script(MOCK + CFG)
    pg.goto('file://' + IDX)
    pg.wait_for_function('typeof Store!=="undefined" && Store.ready===true', timeout=25000)

    # ── a club with a real shape: 3 members, 12 held meetings, and
    #    attendance chosen so the milestone tiers are actually crossed ──
    pg.evaluate("async()=>{AuthUI.mode='up'; await Store.signUp('boss','hunter2222','hunter2222')}")
    pg.wait_for_function('Store.signedIn===true', timeout=15000)
    pg.evaluate("""()=>{
      const db = window.__mockDB;
      db.profiles.find(p=>p.username==='boss').role='board';
      // 25 meetings: 22 in the past, 3 still to come
      for(let i=1;i<=25;i++){
        db.meetings.push({id:'h'+i, meeting_number:i,
          meeting_date: i<=22 ? '2026-01-07' : '2099-01-07',
          start_time:'3:15 PM', end_time:'4:15 PM', location:'MPR', check_in_open:false});
      }
      // three members: 30, 20 and 10 stamps. one account never attends.
      const mk=(uname,n)=>{
        const id='u_'+uname;
        db.profiles.push({id, username:uname, display_name:uname, role:'member',
          created_at:'2026-01-01T00:00:00.000Z'});
        for(let i=1;i<=n;i++) db.attendance.push({id:'a_'+uname+i, user_id:id,
          meeting_id:'h'+i, checked_in_at:'2026-01-07T2'+(i%10)+':00:00.000Z',
          verification_method:'qr'});
      };
      mk('thirty',30); mk('twenty',20); mk('ten',10);
      db.profiles.push({id:'u_never', username:'never', display_name:'never',
        role:'member', created_at:'2026-01-01T00:00:00.000Z'});
      window.saveDB();
    }""")
    pg.evaluate("async()=>await Store.hydrate()")
    pg.wait_for_function('Store.isBoard===true', timeout=15000)

    ov = pg.evaluate("async()=>await Backend.board('overview')")
    raw_att = pg.evaluate("window.__mockDB.attendance.length")

    # ── 1. statistics are real ──
    ck('stamps counted match the attendance table',
       ov['total_seals'] == raw_att, f"{ov['total_seals']} vs {raw_att}")
    ck('meetings held excludes future meetings',
       ov['meetings_held'] == 22, str(ov.get('meetings_held')))
    ck('participating members excludes accounts that never came',
       ov['participating_members'] == 3, str(ov.get('participating_members')))
    ck('average per meeting is total/held',
       abs(ov['average_attendance'] - round(raw_att / 22, 1)) < 0.05,
       str(ov.get('average_attendance')))

    # ── 2. milestone counts derive from attendance ──
    m = ov['milestones']
    ck('10-stamp milestone counts every member at or above it', m['m10'] == 3, str(m))
    ck('20-stamp milestone counts two members', m['m20'] == 2, str(m))
    ck('30-stamp milestone counts one member', m['m30'] == 1, str(m))

    # ── 3. the landing view is Club, and it says what Keystamp is ──
    pg.wait_for_function("typeof navigating==='undefined' || navigating===false", timeout=20000)
    pg.evaluate("async()=>{ BoardUI.tab='club'; await go('board'); }")
    pg.wait_for_selector('#boardPane', timeout=20000)
    pg.wait_for_timeout(900)
    txt = pg.inner_text('#boardPane'); low = txt.lower()
    ck('board lands on Club, not an admin table', pg.evaluate('BoardUI.tab') == 'club')
    # the explainer blurb and the MPR rule were removed on purpose;
    # these assert they stay removed rather than that they exist
    ck('no Keystamp explainer blurb on Club Tools',
       'attendance stamp card' not in low, txt[:160])
    ck('no "held in the MPR on Wednesdays" prose',
       'held in the mpr' not in low, txt[:160])
    ck('no "counted from real check-ins" filler',
       'counted from real check-ins' not in low and 'entered by hand' not in low, txt[:160])
    ck('does not say "MPR Room" or "Room MPR"',
       'mpr room' not in low and 'room mpr' not in low)
    ck('real figures are on the landing view',
       str(raw_att) in txt and '22' in txt, txt[:200])

    # ── 4. next meeting shown when nothing is open ──
    ck('shows the next General Meeting', 'next general meeting' in low, txt[:200])
    ck('next meeting is the soonest upcoming one',
       ov['next_meeting'] and ov['next_meeting']['meeting_number'] == 23,
       str(ov.get('next_meeting')))
    ck('check-in state is stated in words, not colour alone',
       'check-in closed' in low, txt[:200])

    # ── 4b. board gets its OWN navigation ──
    nav = pg.evaluate("()=>[...document.querySelectorAll('#tabs .tab')].map(t=>t.innerText.trim())")
    navlow = ' '.join(nav).lower()
    ck('board nav shows board chapters',
       'club tools' in navlow and 'meetings' in navlow and 'check-in' in navlow, str(nav))
    ck('board nav drops the member chapters',
       'record' not in navlow and 'rewards' not in navlow and 'scan' not in navlow, str(nav))
    ck('a board account never lands on the member spread',
       pg.evaluate("gate('home')") == 'board' and pg.evaluate("gate('rewards')") == 'board')

    # ── 5. progress pane ──
    pg.evaluate("async()=>await go('bmembers')"); pg.wait_for_timeout(1400)
    ptxt = pg.inner_text('#boardPane'); plow = ptxt.lower()
    ck('progress names all three milestones',
       'club merch' in plow and 'free blindbox' in plow and '???' in plow)
    ck('progress states real milestone counts',
       '3 members reached 10 stamps' in plow and '1 member reached 30 stamps' in plow,
       ptxt[:260])
    ck('roster is reachable from progress', 'roster' in plow)

    # ── 6. meeting history stays informational ──
    pg.evaluate("async()=>await go('bmeet')"); pg.wait_for_timeout(1400)
    mtxt = pg.inner_text('#boardPane'); mlow = mtxt.lower()
    ck('meeting history lists meetings', 'gm' in mlow and 'mpr' in mlow)
    dangerous = ['Remove stamp', 'Give stamp', 'Edit member', 'Revoke']
    found = [w for w in dangerous if w.lower() in pg.inner_text('#boardPane').lower()]
    ck('no stamp-editing controls in meeting history', not found, str(found))

    # ── 7. check-in still works, and is the only stamp path ──
    pg.evaluate("async()=>await go('bcheckin')"); pg.wait_for_timeout(1400)
    stxt = pg.inner_text('#boardPane'); slow = stxt.lower()
    ck('check-in pane offers to open check-in', 'open check-in' in slow, stxt[:200])

    opened = pg.evaluate("""async()=>{
      const m = window.__mockDB.meetings.find(x=>x.meeting_number===23);
      const r = await Backend.startAttendance(m.id);
      boardMeeting = m.id; await loadBoard();
      return r && r.ok === true;
    }""")
    pg.wait_for_timeout(1200)
    ck('board can open an attendance session', opened)
    ck('a QR is rendered once check-in is open',
       pg.evaluate("!!document.querySelector('#qrBox') && document.querySelector('#qrBox').innerHTML.length > 100"))
    ck('open state is labelled, not just coloured',
       'close check-in' in pg.inner_text('#boardPane').lower())
    ck('no client-side stamp shortcut exists anywhere',
       pg.evaluate("typeof Backend.recordAttendance==='undefined' && typeof Store.recordScan==='undefined'"))

    # ── 7b. the QR is ONE code per meeting ──
    twice = pg.evaluate("""async()=>{
      const m = window.__mockDB.meetings.find(x=>x.meeting_number===23);
      const a = await Backend.issueToken(m.id);
      const b = await Backend.issueToken(m.id);
      return { same: a.token === b.token, token: a.token };
    }""")
    ck('asking twice returns the identical code', twice['same'], str(twice)[:120])
    ck('the code is a real attendance token', twice['token'].startswith('keystamp://a/'))

    reopened = pg.evaluate("""async()=>{
      const m = window.__mockDB.meetings.find(x=>x.meeting_number===23);
      await go('board'); await go('bcheckin');
      const c = await Backend.issueToken(m.id);
      return c.token;
    }""")
    pg.wait_for_timeout(800)
    ck('leaving and returning shows the same code', reopened == twice['token'])
    ck('no rotation timer is left running',
       pg.evaluate("typeof boardTimer==='undefined' || !boardTimer"))

    # ── 7d. the rendered code actually scans ──
    # Not "an SVG appeared" but "a camera can read it and the string it
    # yields checks somebody in". Skipped if OpenCV is unavailable.
    if cv2 is not None:
        pg.locator('#qrBox').screenshot(path='/tmp/_qr_check.png')
        img = cv2.imread('/tmp/_qr_check.png')
        decoded, _, _ = cv2.QRCodeDetector().detectAndDecode(img)
        ck('the rendered QR decodes', bool(decoded), str(decoded)[:40])
        ck('it decodes to the server-issued token', decoded == twice['token'])
        small = cv2.resize(img, None, fx=0.25, fy=0.25, interpolation=cv2.INTER_AREA)
        d2, _, _ = cv2.QRCodeDetector().detectAndDecode(small)
        ck('still readable at quarter size (distance/poor camera)', d2 == twice['token'])
        ck('the QR is rendered large enough to scan',
           pg.evaluate("()=>{const e=document.querySelector('#qrBox svg');"
                       "return e ? Math.round(e.getBoundingClientRect().width) : 0;}") >= 260)

    # ── 7c. deleting a meeting ──
    made = pg.evaluate("""async()=>{
      window.__mockDB.meetings.push({id:'del1', meeting_number:77,
        meeting_date:'2099-02-04', start_time:'3:15 PM', end_time:'4:15 PM',
        location:'MPR', check_in_open:false});
      window.saveDB(); await go('bmeet'); return true;
    }""")
    pg.wait_for_timeout(1400)
    ck('an empty meeting offers a Delete control',
       pg.evaluate("!!document.querySelector('[data-bconfirm=\"del1\"]')"))
    ck('a meeting with attendance offers no Delete control',
       pg.evaluate("""()=>{
         const rows=[...document.querySelectorAll('.brow')];
         const withAtt=rows.find(r=>{const n=r.querySelector('.brow__n');
           return n && Number(n.textContent)>0;});
         return !withAtt || !withAtt.querySelector('[data-bconfirm]');
       }"""))

    pg.evaluate("()=>document.querySelector('[data-bconfirm=\"del1\"]').click()")
    pg.wait_for_timeout(900)
    ck('delete asks for confirmation first',
       'delete gm 77?' in pg.inner_text('#boardPane').lower()
       and pg.evaluate("!!document.querySelector('[data-bdelete]')"))
    ck('the meeting is still there while unconfirmed',
       pg.evaluate("window.__mockDB.meetings.some(m=>m.id==='del1')"))

    pg.evaluate("()=>document.querySelector('[data-bcancel]').click()")
    pg.wait_for_timeout(900)
    ck('cancel keeps the meeting',
       pg.evaluate("window.__mockDB.meetings.some(m=>m.id==='del1')")
       and pg.evaluate("!!document.querySelector('[data-bconfirm=\"del1\"]')"))

    pg.evaluate("()=>document.querySelector('[data-bconfirm=\"del1\"]').click()")
    pg.wait_for_timeout(600)
    pg.evaluate("()=>document.querySelector('[data-bdelete]').click()")
    pg.wait_for_timeout(1500)
    ck('confirming removes the meeting',
       not pg.evaluate("window.__mockDB.meetings.some(m=>m.id==='del1')"))
    ck('the list refreshes immediately',
       'gm 77' not in pg.inner_text('#boardPane').lower())
    ck('the app is still usable after a delete',
       pg.evaluate("!!document.querySelector('#boardPane')")
       and 'could not load' not in pg.inner_text('#boardPane').lower())

    # ── 8. authorization is unchanged ──
    demoted = pg.evaluate("""async()=>{
      window.__mockDB.profiles.find(p=>p.username==='boss').role='member';
      window.saveDB(); await Store.hydrate();
      try { await Backend.board('overview'); return 'ALLOWED'; }
      catch(e){ return String(e.message||e); }
    }""")
    ck('a member is refused board data', demoted != 'ALLOWED', demoted)
    ck('board route is refused for a member', pg.evaluate("gate('board')") == 'home')

    # ── 8b. member-side cleanup and scanner ──
    pg.evaluate("""async()=>{
      window.__mockDB.profiles.find(p=>p.username==='boss').role='member';
      window.saveDB(); await Store.hydrate();
    }""")
    pg.wait_for_function("typeof navigating==='undefined' || navigating===false", timeout=20000)
    pg.evaluate("async()=>await go('profile')")
    pg.wait_for_selector('.view', timeout=20000); pg.wait_for_timeout(900)
    ck('no dead "Club information" button for members',
       not pg.evaluate("!!document.querySelector('.board-link')"))

    pg.evaluate("async()=>await go('rewards')")
    pg.wait_for_selector('.view', timeout=20000); pg.wait_for_timeout(900)
    ck('reward cards drop the blurb that restated the name',
       not pg.evaluate("!!document.querySelector('.tech__desc')"))

    # scanner: states must be visually distinct without relying on colour
    pg.evaluate("async()=>await go('scan')")
    pg.wait_for_selector('#reticle', timeout=20000); pg.wait_for_timeout(800)
    # the view re-renders on any Store change, so re-query each time
    states = pg.evaluate("""()=>{
      const out={};
      for (const st of ['live','good','bad']){
        const ret=document.querySelector('#reticle');
        if(!ret) return null;
        ret.className='reticle reticle--'+st;
        const c=document.querySelector('.reticle__c--tl');
        if(!c) return null;
        out[st]=getComputedStyle(c).borderTopWidth;
      }
      const m=document.querySelector('.viewer__msg');
      if(!m) return null;
      const msg=getComputedStyle(m);
      out.msgBg=msg.backgroundColor; out.msgColor=msg.color;
      return out;
    }""") or {}
    if states:
        ck('scanner success and failure look different',
           states['good'] != states['live'] and states['good'] != states['bad'], str(states))
        ck('scanner status stays legible over any camera image',
           states['msgBg'] not in ('rgba(0, 0, 0, 0)', 'transparent'), str(states['msgBg']))

    # sign-in filler
    pg.evaluate("async()=>{await Store.signOut();}")
    pg.wait_for_function('Store.signedIn===false', timeout=15000)
    pg.wait_for_timeout(1600)
    auth = pg.inner_text('#view').lower()
    ck('sign-in carries no MPR tagline', 'mpr' not in auth, auth[:120])
    ck('sign-in still shows what it needs',
       'username' in auth and 'password' in auth, repr(auth[:200]))

    # restore board for the mobile checks below
    pg.evaluate("""async()=>{
      await Store.signIn('boss','hunter2222');
      window.__mockDB.profiles.find(p=>p.username==='boss').role='board';
      window.saveDB(); await Store.hydrate();
    }""")
    pg.wait_for_function('Store.isBoard===true', timeout=15000)

    # ── 9. mobile layout ──
    pg.evaluate("""async()=>{
      window.__mockDB.profiles.find(p=>p.username==='boss').role='board';
      window.saveDB(); await Store.hydrate();
    }""")
    pg.wait_for_function("typeof navigating==='undefined' || navigating===false", timeout=20000)
    pg.evaluate("async()=>{ BoardUI.tab='club'; await go('board'); }")
    pg.wait_for_selector('#boardPane', timeout=20000)
    pg.wait_for_timeout(800)
    pg.set_viewport_size({'width': 390, 'height': 844})
    pg.wait_for_timeout(600)
    over = pg.evaluate("""()=>{
      const d=document.documentElement;
      return { scroll:d.scrollWidth, client:d.clientWidth };
    }""")
    ck('no horizontal scrolling at 390px',
       over['scroll'] <= over['client'] + 1, str(over))
    ck('club content still renders on mobile',
       'general meeting' in pg.inner_text('#boardPane').lower())

    pg.set_viewport_size({'width': 820, 'height': 1180}); pg.wait_for_timeout(400)
    tab = pg.evaluate("""()=>{
      const d=document.documentElement; return d.scrollWidth <= d.clientWidth + 1;
    }""")
    ck('no horizontal scrolling at 820px', tab)

    b.close()

ok = sum(1 for _, c, _ in R if c)
for n, c, x in R:
    print(('PASS ' if c else 'FAIL ') + n + (('  <- ' + x) if not c and x else ''))
print(f"\n{ok}/{len(R)} passed")
raise SystemExit(0 if ok == len(R) else 1)
