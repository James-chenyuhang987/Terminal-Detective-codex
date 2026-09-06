# Detective story theater / 侦探剧情现场

## Experience and scope

Terminal Detective offers two presentations of **one investigation engine**:

- **3D 侦探剧情模式 / 3D detective story mode** — a compact third-person cyber-noir scene, animated interview contacts, camera framing, field subtitles, and a deliberate investigation HUD.
- **终端文字剧情模式 / Terminal text story mode** — the existing terminal, paginated investigation transcript, NPC questions, map, evidence tools and report.

This is an original, room-scale story theater, not an open world or an AAA character-action game. Story delivery uses subtitles and Idle/Walk/Talk gestures, not recorded voiceover. There is no imported commercial-game art or external asset CDN.

## Playable flow

1. **Landing → mode chooser.** Start Investigation first opens a bilingual, keyboard-accessible choice. Select a presentation and confirm, or go back. The choice itself neither registers a profile nor starts/charges a case.
2. **Identity → home.** Existing account/profile loading and identity registration remain authoritative. The chosen presentation is stored locally, independently of the cloud profile. Home and Settings expose the same two-mode control.
3. **Home Start → world prologue → case / team → case briefing.** In theater mode only, Home's explicit **开始调查 / Start Investigation** opens a generic, original world-setting passage before any case is selected. Continue or Skip opens the existing saved-team case selector; without a saved team, the existing investigator configuration still comes first. Direct case cards, team/navigation links and Home Resume do not trigger the prologue. Selecting a case (including deployment from its team planner) opens a bilingual briefing built from the public `caseNarrativeLibrary` and `localizeCase` scene description. **Back home**, including Escape, cancels either entry passage without starting a run or charging energy. On the case briefing, **Continue / Skip confirms entry and its normal energy cost** through the single-flight existing `startCase` handler. Once that transaction has begun, entry/cancel controls are disabled; failures retain a retryable briefing and safe error message. Text mode keeps its original entry flow.
4. **Scene arrival.** A run that received the new case briefing suppresses the older duplicate arrival panel using the existing presentation spatial ref. The briefing includes movement/contact controls, resource costs and the distinction between claims and proof. Text-started runs that later switch to theater retain the original arrival explanation. Text mode keeps its existing mission preparation page; narration does not append duplicate bootstrap lines to its transcript. A mode change is not a new scene visit for game-rule purposes.
5. **Explore and interview.** Walk around a room, orbit the camera, approach a marked contact or prop and interact. Contacts open the existing NPC initial statement and dynamically validated, investigator-specific question choices. A labelled Contacts list is an equivalent non-spatial interaction path. Statements are claims, not verified facts. After an effective answer and dialogue closure, theater can show one reflective interlude per public story stage (see the trigger contract below).
6. **Investigate and choose.** A workstation opens the investigation explanation; Investigate / Recover invokes the existing observation → thought → decision → settlement cycle. The decision desk chooses the actual investigator, action and optional commands. Recovery remains the existing depleted-team recovery choice, not a new free-rest rule. Each investigation turn restores 4% stamina before participants spend 10%; an interview question spends 10% without recovery. Recovery advances the same round/deadline clock.
7. **Move between rooms.** A door shows connected zones and their action entry requirements. It is **not** a free teleport. Choose an action through the decision desk and existing route-priority tool. Only the existing legal action and settlement can update `current_zone`; the renderer follows that value.
8. **Evidence and reconstruction.** Open the evidence locker, link board, visual board, case-flow map and decision log from the toolkit. Only discovered evidence is available. Validating links and writing the structured report call the same handlers in both modes. Public outcomes appear as field subtitles; the full transcript remains in the notebook.
9. **Ending and rewards.** Accepted reports and voluntary endings use the existing GameOver screen, frozen settlement snapshot, reward eligibility and settlement retry logic. Presentation controls remain accessible during this phase, but do not dismiss or recreate it.
10. **Home and resume.** The fixed Home / suspend control hides the run while keeping its owner mounted. Home offers resume rather than allowing a second case to overwrite a suspended run. A mode can be changed there and the same run resumed. This is an in-memory suspension, **not** a durable save across a page reload, closed tab, logout or browser restart. Existing ending-screen leave controls finish the run normally.

## Common-state invariants

`src/pages/TerminalDetective.jsx` owns routing and the selected run. `InvestigationTerminal.jsx` owns the active run and all consequential callbacks. The page does not key or remount that owner by screen or story mode. It supplies `presentationActive` while a run is hidden. The renderer and HUD are presentation children only.

Changing `storyMode` only updates the validated local setting (`terminal` or `theater`). It does not call `startCase`, profile mutation, action execution, an abort callback, decision resolution or settlement. The same `run_id`, AP, investigator stamina, turns, HP, confusion, discovered/destroyed clues, links, NPC dialogue/question state, command points, pending decision and report draft remain owned by the same component.

- `resolveTheaterInteraction` translates contact intents into existing NPC callbacks, and prop/door intents into UI panels. It has no engine state or reward API.
- Spatial location and camera are stored separately in a ref on the run owner. They are not a case zone, action or resource.
- Doors do not override adjacency or entry requirements. Props do not disclose undiscovered clue IDs/names or award evidence for proximity.
- NPC opening text comes from `initial_statement`; branch questions/results come from the existing interrogation handlers. No scene-specific dialogue reveals protected truth or identifies a culprit.
- Movement pauses for actions, questions, tools, report, settings, onboarding, command console, decisions, crises, cinematics, hidden route and loss of browser focus/visibility.
- A submitted action may finish while the run is suspended. Suspension is not transaction cancellation. Its result still commits through the original operation-generation checks, round commit, crisis claim and settlement flow.
- DecisionCards remains mounted while hidden. Its current agent/card/command selection and remaining time are retained. The countdown pauses at Home, in Settings and when the document is hidden or unfocused; hiding it does not resolve the pending promise.
- Existing irreversible evidence destruction, inclusive deadlines, recovery behavior and one-time crisis scheduling are not reimplemented by theater.
- The fixed controls render in a body portal above action overlays. They switch presentation or suspend the run; they never invoke the existing abort or ending callbacks. GameOver stays mounted during Home/Settings/mode changes, including a pending reward write.

The older **ActionCinematic** setting remains separate: it enables an optional short action-result replay. It is not the permanent story presentation mode and does not select it implicitly.

### Narrative queue and trigger contract

`theaterNarrative.js` owns only public copy and a pure queue/dedupe reducer. `InvestigationTerminal` initializes that reducer once with the existing `run_id`; it remains beside, not inside, authoritative `gameState`.

- A question is eligible if submitted in theater mode. The returned current-operation result must have a nonempty response, positive `cooperationChange`, no repeated-question flag, no error and no confusion penalty. The UI's estimated alignment, merely opening a contact, weak/repeated answers, rejected requests and aborted/stale responses cannot enqueue chapters.
- The event is dispatched **after the original question effects commit and before refreshing options**. Consequently an option-refresh failure cannot lose a successful chapter. Home or mode changes during either request do not cancel the operation, repeat spending, forget the answer, or change eligibility after submission. Terminal-origin questions do not acquire chapters retroactively by switching to theater.
- The stage is captured from the committed public progress: `opening` for turns 0–1 or no clues, otherwise `convergence` at ≥55% discovered clues, and `pursuit` in between. These are the existing observation chapter boundaries. Each stage is marked seen on enqueue, not every question; subsequent questions, language/settings changes, Home Resume and mode switches cannot enqueue it again. A fresh run has a fresh queue.
- A queued entry waits for the matching dialogue to close. Explicitly replacing that dialogue with another contact or a text report also closes/releases it, but selected dialogue/report still prevents presentation. Entries are ordered, and only completion/Skip removes the head. Switching presentation or suspending leaves both queue and typewriter progress intact.
- Presentation waits for an active theater route with no question/action/link transaction, selected dialogue, report, decision, crisis (including its delayed claim), action/link cinematic, crash, settlement/ending, Settings, onboarding, command console or tools. Finishing an investigation never waits on narration, and ending/settlement remains authoritative.
- Interludes use original, stage-specific reflection on recorded answers and the need for verification. They do not quote protected answers, claim an unobserved case event, identify a suspect as guilty, reveal a clue or report solution, call rules, alter ask history, spend stamina/AP or grant evidence. Existing question effects remain the only source of their usual consequences.

### Narrative frame and accessibility

`NarrativeOverlay.jsx` and isolated `narrative.css` render a native modal terminal frame in the upper half of the viewport; the scene remains visible below the lightly shaded input-blocking backdrop. The full passage reserves its wrapping from the first frame, while only its prefix is visually revealed. The scrollable passage and fixed-in-frame button rows keep **Show all / Continue / Skip** reachable on 375×812, 768×1024 and 1440×900 layouts.

The native dialog contains keyboard focus and blocks underlying scene/HUD actions. A static accessible passage is separate from the character animation; no character-by-character live announcement occurs. The passage can be keyboard-scrolled. Reduced motion reveals immediately. The timer is cleared when inactive, busy, hidden, unfocused or unmounted, and resumes without resetting the passage on language changes or Home/Settings return. Connected visible focus is restored on close; stale dialogue focus falls back to the active run's presentation controls rather than focusing a hidden run.

During interludes, equivalent Home / Settings / text-mode controls are provided **inside** the dialog because the underlying portal toolbar is intentionally inert under a native modal. Settings or Home hides/closes the presentation modal without consuming the chapter. Escape skips an interlude; Escape cancels an unconfirmed entry passage. Continue remains disabled until full reveal; Skip advances directly.

## Scene and asset architecture

`TheaterPresentation.jsx` is a DOM HUD with an error boundary and a lazy import of `TheaterScene.jsx`. The renderer loads local Blender room/character GLBs plus `assets/theater/manifest.json`. All asset URLs are derived from `${import.meta.env.BASE_URL}assets/theater/…`, including subpath deployments. Terminal-only play never requests theater GLBs or its renderer chunk. Existing optional action cinematics can still load their own separate assets.

The asset contract contains five reusable room sets (`office`, `datacenter`, `lobby`, `laboratory`, `balcony`) and four rigged characters (`detective`, `witness`, `security`, `scientist`). The manifest supplies room bounds, XZ collider rectangles, spawn, door/hotspot anchors and interview staging positions. Y is up; the characters face +Z, stand at logical y=0 and are approximately 1.75m high. Skinned instances are cloned using Three's skeleton-aware clone, with independent animation mixers; cached GLTF materials are not disposed by individual instances.

Room bounds/collider helpers use a finite-radius actor and small collision substeps. Pointer camera movement does not require pointer lock. The camera follows the actor in exploration and frames the selected interview contact during dialogue. World geometry is decorative; the public case graph and action engine retain travel authority.

### First authored case versus the remaining catalog

**Lvl_01 / 霓虹血迹** has a deliberate semantic sequence across data center, lobby, private lab and balcony. The first-case stage is compact and uses the authored room kit, not a continuous exterior city. Even here, door access uses the existing case's action conditions (`check_cctv`, `hack_terminal`, `search_area`), not visual proximity.

The other seven cases retain their own public briefings, contacts, clues, graphs, investigation branches and endings. Recognized zone semantics reuse the appropriate room kit; unmatched zones use the generic office. This is **generic staging of playable case data, not seven additional bespoke 3D worlds**. Existing case data does not define physical NPC room residence, so contacts are interview representations staged in rooms rather than simulated schedules or claims about their canonical location. Role-based cast models represent different named contacts; there are not unique portrait models for every NPC.

See `docs/theater-assets.md` in the asset contribution for Blender sources, export reproduction, budgets and exact manifest layout.

## Input, accessibility and layout

- Focus or click the scene, then use **WASD or arrow keys** to move; **E** interacts with a nearby labelled target.
- **Pointer/touch drag** orbits the camera without mandatory pointer lock.
- A labelled **Interact** button and four-direction **touch pad** provide explicit controls. After returning from an unfocused tab/window, a fresh direction press (touch or Space/Enter on a focused direction button) reactivates movement without another scene tap. Returning window focus alone never resumes a previously held direction. Contacts and route/tool panels are alternatives to finding targets spatially.
- Movement input ignores typing in inputs, textareas, selects and content-editable controls. Releasing capture, pointer cancellation, blur, hidden tabs and modal suspension clear held movement.
- Ordinary field panels focus their heading region when opened, offer a labelled close button/Escape action and restore still-connected prior focus. Existing report/dialogue panels retain their own close controls.
- The 3D viewport is not the only route to gameplay: the always-available text switch works even when loading or WebGL fails.
- Navigation/tool buttons use 44px minimum hit targets, visible focus outlines, wrapped layouts and mobile safe-area insets. Field/tool/transcript panels scroll independently of the viewport. Responsive rules cover phone/tablet/desktop, with 375×812, 768×1024 and 1440×900 as integration targets.
- New labels/instructions are bilingual Chinese/English. Story facts remain supplied by the existing localized case and engine paths.

## Performance and failure behavior

Theater is opt-in and lazy. Device-pixel ratio is bounded; the renderer uses the existing quality setting, simple lighting and no particle-heavy postprocessing. Reduced-motion preferences suppress decorative motion/animation where supported. Browser blur, hidden state and modal state pause exploration rather than leaving held keys active.

Loading shows an explanatory status/progress view. A failed manifest/GLB request, unsupported WebGL, renderer exception or lost graphics context produces a clear fallback with one-click **Continue in text mode**. The error boundary encloses the scene, not the authoritative run owner. Failure never restarts a case or retries a charge. There is no required external CDN, Draco decoder, texture service or new environment variable.

## Verification and limits

The existing Node runner covers mode validation/routing contracts, scene semantics across the eight cases, manifest/collision/input helpers, contact intent mapping, no-cost/no-clue prop interactions, mounted-run integration, decision suspension and the unchanged state/round/settlement rules. Source-contract tests protect the React ownership and callback wiring; they do not claim to simulate browser reconciliation. Behavioral helper tests exercise the actual intent, collision and game-state functions.

Run relevant tests with `node --test tests/storyMode.test.js tests/theaterAssets.test.js tests/theaterWorld.test.js tests/theaterPresentation.test.js tests/theaterFallback.test.js tests/theaterInput.test.js tests/terminalEntry.test.js tests/decisionLayer.test.js tests/gameState.test.js tests/roundCrisis.test.js tests/caseRuntime.test.js tests/agentStamina.test.js tests/settlementResult.test.js`, then the repository typecheck, lint, security check and production build. The integrated revision passes all 99 tests in this targeted command and all four checks. The earlier asset/UI integration also passed the then-current complete 350-test suite. The production build retains a non-blocking warning for the lazy Three/GLTF chunk.

### Narrative enhancement verification — 2026-09-06

`node --test tests/theaterNarrative.test.js tests/storyMode.test.js tests/theaterPresentation.test.js tests/terminalEntry.test.js tests/decisionLayer.test.js tests/gameState.test.js tests/roundCrisis.test.js tests/caseRuntime.test.js tests/agentStamina.test.js tests/settlementResult.test.js` passes **81 tests**, including 17 new narrative tests. The new suite evaluates actual entry/question/close handlers and overlay timer/focus effects with adapters, plus public-copy, queue, stage and source-ownership contracts. It covers cancellation before charge, duplicate confirmation, retry, asynchronous switches and stale results, preserved stamina/ask history/clue effects, option-refresh failure, stage dedupe, safe deferral and lifecycle cleanup. Typecheck, lint and production build pass; the existing lazy Three/GLTF chunk size warning remains non-blocking. These Node tests do not simulate browser reconciliation, native focus containment or real viewport layout; independent isolated browser integration is still required for the new narrative UI.

### Local browser integration — 2026-09-06 (baseline before narrative chapters)

Verified with actual bundled GLBs, real React routes and the existing local detective rules in isolated Chrome 152 with software WebGL. Authentication and profile storage were **in-memory fixtures**, with other API routes blocked; no production identity, profile or database writes were made. Existing UI labels mentioning Firebase/Cloudflare are not proof of a production connection in this fixture.

- **Entry and layout:** initial terminal-only entry requested no theater assets. Captured 375×812, 768×1024 and 1440×900 screenshots and checked document width and tool-button hit targets; no horizontal overflow was observed. Chinese/English switching updated the live theater HUD without a reload.
- **Input and interactions:** real keyboard movement and camera pointer-drag changed only spatial state. Actual 375px touch events and Space on a direction button resumed movement after blur/focus without an extra scene tap. Walking close to a contact and pressing E opened the existing dialogue without charging resources. Physical door interaction showed the original prerequisites, not free travel. A subsequent legal `check_cctv` action changed the authoritative zone and loaded the lobby GLB.
- **Shared investigation:** an NPC question completed across presentation changes with one stamina charge. A pending decision retained its selected action/agent across Home/resume. Report fields and selected evidence, including a rejected report, remained available across presentation changes. Dragging two discovered clues invoked the original link validator and retained its invalid-link result after switching; an incomplete report remained disabled.
- **Ending and persistence:** submitted a real evidence-backed report to the local rules and reached an A-grade ending. A deliberately delayed in-memory reward write survived Settings, both presentations and Home/resume. Repeated switching did not repeat settlement or awards (one settlement per run). Voluntary failed-run ending was checked separately. These are UI/state-lifecycle checks, not backend idempotency or cloud-delivery tests.
- **Failure recovery:** actual `WEBGL_lose_context`, a blocked manifest request and simulated unavailable WebGL creation each showed the fallback. Returning to text preserved the exact run state; restoring resources allowed 3D to load again. Native Canvas fallback content must remain inert: Fiber 8 mounts it even on working WebGL devices. Lifecycle tests separately cover input release/cancellation, visibility, suspension, cleanup and context-loss reporting.
- **Deployment paths:** same-origin root production build passes. A separate Pages-subpath build checks the HTML/renderer base URLs. Serving that build locally returned HTTP 200 for the page, manifest and all nine GLBs, with GLB bytes matching the originals; this does not exercise production sign-in or cloud APIs.

Screenshots and temporary test fixtures are local validation artifacts, not runtime authentication shortcuts shipped with the game. No production profile, D1 or Firebase mutation is required for isolated UI verification.

### Remaining limits

Software-rendered desktop Chrome and viewport emulation do **not** establish real mobile GPU performance, Safari behavior, screen-reader usability or a complete visual art review. The first and eighth cases were exercised in-browser; all eight have automated scene/interaction mapping coverage, not complete bespoke browser playthroughs. The successful report/ending test does not claim every story branch or every valid evidence link was manually traversed. Home suspension is still memory-only, as described above. Production Firebase/D1 write success requires a separately authorized environment test.
