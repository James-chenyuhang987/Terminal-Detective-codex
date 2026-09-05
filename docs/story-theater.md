# Detective story theater / 侦探剧情现场

## Experience and scope

Terminal Detective offers two presentations of **one investigation engine**:

- **3D 侦探剧情模式 / 3D detective story mode** — a compact third-person cyber-noir scene, animated interview contacts, camera framing, field subtitles, and a deliberate investigation HUD.
- **终端文字剧情模式 / Terminal text story mode** — the existing terminal, paginated investigation transcript, NPC questions, map, evidence tools and report.

This is an original, room-scale story theater, not an open world or an AAA character-action game. Story delivery uses subtitles and Idle/Walk/Talk gestures, not recorded voiceover. There is no imported commercial-game art or external asset CDN.

## Playable flow

1. **Landing → mode chooser.** Start Investigation first opens a bilingual, keyboard-accessible choice. Select a presentation and confirm, or go back. The choice itself neither registers a profile nor starts/charges a case.
2. **Identity → home.** Existing account/profile loading and identity registration remain authoritative. The chosen presentation is stored locally, independently of the cloud profile. Home and Settings expose the same two-mode control.
3. **Case / briefing / team.** Use the existing unlocked case selection, briefing and investigator configuration. The existing `startCase` path is the only route that charges for entering a new case.
4. **Scene arrival.** Theater displays the public case briefing and an explanation of controls/resource costs before exploration. Text mode keeps its existing mission briefing. A mode change is not a new scene visit for game-rule purposes.
5. **Explore and interview.** Walk around a room, orbit the camera, approach a marked contact or prop and interact. Contacts open the existing NPC initial statement and dynamically validated, investigator-specific question choices. A labelled Contacts list is an equivalent non-spatial interaction path. Statements are claims, not verified facts.
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
- A labelled **Interact** button and four-direction **touch pad** provide explicit controls. Contacts and route/tool panels are alternatives to finding targets spatially.
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

Run relevant tests with `node --test tests/storyMode.test.js tests/theaterWorld.test.js tests/theaterPresentation.test.js tests/terminalEntry.test.js tests/decisionLayer.test.js tests/gameState.test.js tests/roundCrisis.test.js tests/caseRuntime.test.js tests/agentStamina.test.js tests/settlementResult.test.js`, then the repository typecheck, lint and production build.

The UI contribution is validated independently of the separate Blender-asset commit. Final integration must serve the real local GLBs and visually check the target viewports, keyboard and touch movement, camera/door reachability, NPC question results, link/report/ending flow, switching during an action and a pending decision, HOME/resume, tab blur, network failure and WebGL context loss. Real GPU/mobile-device performance, screen-reader behavior and production backend write success are not established by Node tests or a production build. No production profile, D1 or Firebase mutation is required to perform isolated UI verification.
