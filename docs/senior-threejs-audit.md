# Senior Three.js / WebGL audit

## 1. EXECUTIVE SUMMARY

Аудит поточної версії, 8 листопада 2026 року. Код застосунку не змінювався; залежності не встановлювалися; commit, push і deployment не виконувалися. Єдиний новий файл — цей звіт. Попередній `final-audit.md` не перезаписано.

Невеликий Three.js застосунок має доречну архітектуру та реально працюючі моделі, фізику, шейдери й ритуал. У перевірених сценаріях немає P0/P1 збоїв. TypeScript, 24 тести і production build успішні. Десять повних activation/reset у вбудованому браузері пройшли без warn/error. Це позитивні докази, а не гарантія відсутності всіх витоків чи сумісності з усіма GPU.

Знахідки: **P0 — 0; P1 — 0; P2 — 3; P3 — 2**. Дві P2 стосуються підтвердженої поведінки таймінгу/готовності assets; третя — прогалини перевірки App lifecycle, а не доведеного витоку. Виявлені застереження не потребують перебудови архітектури.

Дев’ять технічних університетських вимог підтверджено для перевіреного середовища. Повне виконання завдання залишається PARTIAL: публічний працюючий URL застосунку не підтверджено, а здатність студента пояснити реалізацію потребує захисту.

## 2. REPOSITORY BASELINE

| Параметр | Фактичний стан |
| --- | --- |
| Repository | https://github.com/100kgtrotila/the-forgotten-chapel |
| Local HEAD | `2715d823b501fd424b006f9f740f6fe64cae1353` |
| Branch | `main`, tracking `origin/main` |
| Remote main | `git ls-remote` повернув той самий SHA |
| Working tree до аудиту | Чисте; наприкінці очікується лише untracked файл цього звіту |
| OS / runtime | Windows; Node `v26.8.1` |
| Installed packages | Three.js / @types/three `0.187.0`; Rapier compat `0.21.0`; TypeScript `7.0.2`; Vite `8.3.6` |
| Package manager | npm, `package-lock.json` |
| Scripts | dev: vite; preview: vite preview; check: tsc --noEmit; test: node --test tests/*.test.ts; build: tsc --noEmit && vite build |
| Configuration | Strict TypeScript, noEmit; include=src, tests не входять у typecheck; окремого Vite config немає |
| Documentation | README.md, ASSETS.md, DEPLOYMENT.md, docs/final-audit.md; bundled Lucy LICENSE.md |
| Tests | 6 test files, 24 tests; окремих lint/format scripts немає |

Baseline перевірено командами `git status --short --branch`, `git rev-parse HEAD`, `git ls-remote origin refs/heads/main`, `node --version`, `npm ls --depth=0`. Build output у gitignored `dist/` був перегенерований дозволеною командою.

## 3. ARCHITECTURE MAP

`main.ts` → `App` → scene factories / material loading / model slots → `RenderingPipeline`; окремо async `PhysicsWorld.create` → `RitualController` → `RitualEffects` і `MagicSeal`.

- `src/main.ts:15`: створює App, реєструє HMR dispose, повідомляє про startup failure.
- `src/core/App.ts:48`: renderer, camera, controls, сцена, resize, UI bindings, асинхронна готовність та єдиний render loop.
- `src/scene/createChapel.ts:18`, `createArchitecture.ts:6`, `createPaving.ts:9`: композиція, геометрія, координати опор, instancing і bounds для колайдерів.
- `src/scene/assets.ts:52`, `materials.ts:41`: кеш на один loading batch, fallback, texture classification і shared-resource cleanup.
- `src/interaction/RitualController.ts:18`: переходи стану й узгоджена шкала часу; pointer binding відокремлений функцією.
- `src/physics/PhysicsWorld.ts:20`: власник World, bindings, fixed stepping, reset/free.
- Seal та VFX володіють власними geometry/materials; App звільняє ресурси решти scene graph із дедуплікацією.

App є центральним координатором, і його розмір сам по собі не є дефектом. Немає підстав вводити ECS, DI container, managers або розбивати PhysicsWorld. Конкретна слабкість — відсутність інтеграційного тесту координатора, F03. Залежність VFX від center і identity-transform stone group проста, але ці припущення слід пояснювати при подальших змінах сцени.

## 4. UNIVERSITY REQUIREMENTS MATRIX

| Вимога | Статус | Джерело / фактичний доказ / пояснення для захисту |
| --- | --- | --- |
| 1. Примітиви | PASS | `createChapel.ts:23,42,98,130`, `createArchitecture.ts:45`: planes/boxes/cylinders/spheres/torus та extruded arches реально видимі. Геометрія задає форму, Mesh поєднує її з матеріалом. |
| 2. Складні імпортовані моделі | PASS | `assets.ts:13,27,52`, `createArchitecture.ts:89,133`: Lucy 100,000 triangles ×2, gate 38,140 triangles. Локальні glTF/BIN існують; перевірені індекси; у browser видно ангелів і браму, не лише placeholders. Box3 центрує/приземляє модель, uniform scale зберігає пропорції. |
| 3. Матеріали | PASS | `materials.ts:45–60,83`, `assets.ts:67`: Standard/Physical, roughness/metalness, color SRGB, normal/ARM linear. Lucy має матовий матеріал без texture maps; це валідний PBR, не відсутній asset. |
| 4. Освітлення | PASS | `createLighting.ts:10–28`, `RitualEffects.ts:14,144`: hemisphere, directional moon, дві свічки, ritual point. У preview видно холодне та тепле освітлення. Point falloff decay=2; emissive сам по собі не освітлює сусідні меші, для цього є point light. |
| 5. Тіні | PASS | `App.ts:67`, `createLighting.ts:14–23`, `assets.ts:41`: PCF shadow, тільки moon castShadow, 1024/512. Тіні колон, сходів і статуй спостерігалися. Shadow map — окремий depth render з позиції світла. |
| 6. Анімація | PASS з F01 | `App.animate:190`, `RitualController.update:75`, `RitualEffects.update:131`: orbit, lift, flicker, particles, pulse. Поточні browser фази відтворюються. Залежність від delta правильна в нормальному діапазоні; clamp спотворює wall-clock тривалість нижче 20 FPS. |
| 7. Фізика | PASS | `PhysicsWorld.ts:26–87`: реальний Rapier WASM, gravity, rigid bodies, ball/cuboid colliders. Реальні тести падіння/зіткнень/обертання/reset; у браузері уламки розлітаються й падають. Меш копіює body transform після кроків симуляції. |
| 8. Якісний рендеринг | PASS у перевіреному середовищі | `App.ts:63–68`, `RenderingPipeline.ts:15–24`: HDR composer, bloom, ACES, SRGB, High MSAA 2, DPR cap. Browser High/Low працюють; це технічна реалізація rendering pipeline, не універсальна оцінка художньої якості або гарантія FPS. |
| 9. Власний шейдер | PASS | `MagicSeal.ts:14`, `magicSeal.vert.glsl:3`, `.frag.glsl:7–36`, `RitualEffects.ts:55–115`: власний GLSL, procedural rings/runes/flow/particles. Видимі idle/charge/burst; console не містить shader compile errors. Uniforms змінюють вигляд без перескладання geometry. |
| Production build | PASS | Фактичний `npm run build`, exit 0. |
| Public hosting | NOT VERIFIED / INCOMPLETE | Публічний GitHub repository є, але відомого HTTPS URL застосунку немає. Homepage metadata порожня, GitHub deployments API повернув 0 записів. Це не виключає невказаний сторонній deployment. |
| Пояснення студентом | NOT VERIFIED | Потрібна усна демонстрація; план у секції 15. |

## 5. TECHNICAL FINDINGS

### F01 — Clamp фізичного часу керує також тривалістю закляття

- **SEVERITY:** P2 — MEDIUM.
- **STATUS / CATEGORY:** CONFIRMED BUG у wall-clock тривалості visual activation; фізичний clamp сам по собі є захисною політикою.
- **FILE AND LINE:** `src/core/App.ts:191–196`; `src/interaction/RitualController.ts:7,78,98`.
- **EVIDENCE:** Ad hoc Node-прогін справжнього RitualController/PhysicsWorld із формулою delta з App: 60 FPS → 193 frames / 3.2167 s; 10 FPS → 65 frames / 6.5 s до released. Заявлена activation duration — 3.2 s.
- **ROOT CAUSE:** `Math.min(frameDelta, 0.05)` одночасно живить візуальну шкалу часу та physics. За 100 ms кадру обліковуються тільки 50 ms.
- **IMPACT:** Закляття, periodic animation та фізика сповільнюються на слабкому/завантаженому пристрої; background throttling також розтягує фазу. Це не доведення проблеми продуктивності саме на RTX 4060.
- **REPRODUCTION:** Створити controller, activate; на кожен 1/10 wall second викликати update(min(1/10, .05)); порахувати frames до released. Новий test file не створювався.
- **RECOMMENDED FIX:** Відокремити visual/state clock від bounded physics stepping; явно визначити pause/resume policy для hidden tab, щоб після повернення не було неконтрольованого стрибка.
- **REGRESSION RISK:** Medium: момент передачі transforms у Rapier та узгодження pulse/release. Перевірити 10/30/60/144 FPS, stall і hidden→visible.

### F02 — «Assets ready» не відрізняє реальні моделі від fallback

- **SEVERITY:** P2 — MEDIUM.
- **STATUS / CATEGORY:** CONFIRMED DESIGN PROBLEM, не поточна відсутність моделей.
- **FILE AND LINE:** `src/scene/assets.ts:92–95`; `src/scene/materials.ts:107–109`; `src/core/App.ts:116–123`.
- **EVIDENCE:** Loading errors перехоплюються й поглинаються. Promise.all завершується успішно, після чого App ставить `data-assets=ready`. `tests/assets.test.ts:49–55` і `tests/materials.test.ts` підтверджують resolve з fallback при load failure.
- **ROOT CAUSE:** Один стан «завершено» представляє і успішне завантаження, і degraded mode. Для gate fallback group порожня (`createArchitecture.ts:32–42,89`), тому при помилці брама просто зникає.
- **IMPACT:** Користувач бачить лише процедурну заміну або відсутній gate; UI не повідомляє про degraded scene. Автоматичне очікування ready може помилково підтвердити mandatory imported assets.
- **REPRODUCTION:** Відхилити GLTFLoader.loadAsync, як у наявному тесті; loader resolve-иться й fallback visible. Поєднання з App.then неминуче виставить ready. Browser network failure injection не виконувалася.
- **RECOMMENDED FIX:** Повернути результат load batch із loaded/failed model IDs; розрізняти ready/degraded/error, зберігши корисні fallbacks. Browser acceptance має перевіряти фактичну модель, не лише settled flag.
- **REGRESSION RISK:** Low–medium: не блокувати всю сцену через optional textures; розділити optional та необхідні для здачі models.

### F03 — Не перевірено інтегрований teardown/асинхронні failure paths App

- **SEVERITY:** P2 — MEDIUM.
- **STATUS / CATEGORY:** CONFIRMED VALIDATION GAP; витік чи race у штатному браузерному сценарії НЕ доведено.
- **FILE AND LINE:** `tests/` (усі 6 файлів), `src/main.ts:15–20`, `src/core/App.ts:127–151,233–252`.
- **EVIDENCE:** Тести перевіряють loaders, controller, Rapier та VFX resources, але не конструюють App/WebGLRenderer/composer/ResizeObserver. 10 reset не є 10 mount/dispose. У initializeRitual references і groups публікуються до завершення input binding; catch звільняє лише physics. Якщо binding кидає помилку, cleanup ритуалу/ефектів у цьому catch відсутній. Такий виняток не відтворено з валідними DOM елементами.
- **ROOT CAUSE:** Coordinator lifecycle не має інтеграційної перевірки; happy-path браузерні тести не охоплюють часткову ініціалізацію.
- **IMPACT:** Немає доказів коректної одноразової утилізації всіх owners при ранньому HMR teardown або ініціалізаційному винятку. Це ризик повторного mount/подальшого розвитку, а не твердження про поточний P1 leak.
- **REPRODUCTION:** Перевірити test imports: App/RenderingPipeline не використовуються. Для подальшого fault-injection затримати Rapier/model init, dispose App до resolve; окремо відхилити late setup.
- **RECOMMENDED FIX:** Додати 1–2 вузькі browser lifecycle fixtures; лише за результатами зробити ініціалізацію транзакційною й cleanup часткового owner. Великий testing framework або переписування App не потрібні.
- **REGRESSION RISK:** Low для тестів, medium для cleanup changes: shared resources не повинні звільнятися під іншими активними instances.

### F04 — Deployment guide неправильно узагальнює ліцензії та Git-стан

- **SEVERITY:** P3 — LOW.
- **STATUS / CATEGORY:** CONFIRMED DOCUMENTATION DEFECT.
- **FILE AND LINE:** `DEPLOYMENT.md:7,10`; порівняти `ASSETS.md:3,9`, `public/models/lucy_angel/LICENSE.md:5–7`.
- **EVIDENCE:** Інструкція називає included models CC0; Lucy не CC0. Також guide стверджує, що push не виконувався, хоча local/remote SHA збігаються й repository публічний. Старий final-audit прямо позначений історичним, тому його старі числа не є новим runtime доказом і не рахуються окремим дефектом.
- **ROOT CAUSE:** Deployment guide не синхронізовано після заміни моделі й публікації GitHub.
- **IMPACT:** Читач може неправильно зрозуміти дозволене повторне використання assets або виконати зайві Git setup steps. Підтвердженого порушення ліцензії в цій навчальній сцені не встановлено.
- **REPRODUCTION:** Зіставити зазначені файли й git baseline.
- **RECOMMENDED FIX:** Уточнити Stanford terms, attribution і відокремити repository publication від website deployment.
- **REGRESSION RISK:** Low; лише документація. У цьому аудиті її не змінено.

### F05 — Великий початковий download для готовності ритуалу

- **SEVERITY:** P3 — LOW.
- **STATUS / CATEGORY:** CONFIRMED PERFORMANCE OPPORTUNITY, не доведений GPU bottleneck.
- **FILE AND LINE:** `package.json:14` (Rapier dependency), `src/core/App.ts:128`; production build output.
- **EVIDENCE:** main JS 728.47 kB / 185.60 kB gzip; async PhysicsWorld JS 4,334.39 kB / 1,670.06 kB gzip. Vite warning >500 kB. Compat містить WASM, окремого .wasm download немає. Сцена рендериться до physics ready, кнопки до того disabled.
- **ROOT CAUSE:** Вага Three.js та compat WebAssembly distribution, не зайві бібліотеки і не розмір власного PhysicsWorld.ts.
- **IMPACT:** Вартість cold download/parse/compile для повільної мережі/CPU; фактична затримка на реальному hosting не вимірювалася.
- **REPRODUCTION:** `npm run build`, порівняти sizes async chunk.
- **RECOMMENDED FIX:** Спочатку виміряти cold-load на hosting, compression/cache та час до enabled Activate. Лише за підтвердженої потреби порівнювати alternate WASM packaging; штучне дроблення файлу не гарантує економії байтів.
- **REGRESSION RISK:** Low для вимірювання, medium для заміни пакування WASM; перевірити MIME, CSP, base URL і load failures.

## 6. THREE.JS / RENDERING ASSESSMENT

- Є один `renderer.setAnimationLoop` і один повний `pipeline.render` на кадр. RenderPass рендерить scene; bloom і OutputPass додають fullscreen passes. Другого прямого main-scene renderer.render немає.
- Встановлений `three/src/renderers/WebGLRenderer.js:2405–2420` обирає linear working color space та NoToneMapping для звичайного offscreen target. `examples/jsm/postprocessing/OutputPass.js:93–109` застосовує exposure/ACES/SRGB на виході. Стандартні shader chunks у seal/VFX не спричиняють тут другого ACES або gamma pass.
- High: HalfFloat targets, samples=2, bloom strength=.2, radius=.2, threshold=.65; DPR≤1.5. Low: samples=0, bloom disabled, DPR≤1. Shadow map зменшується 1024→512. Default framebuffer antialias не заміняє MSAA offscreen targets.
- При зміні samples обидва targets dispose-яться і можуть бути повторно виділені Three.js із новими параметрами; це підтримуваний lifecycle. П’ять High→Low→High пар у browser не дали framebuffer/shader errors. Немає доказу severe MSAA дефекту на перевіреному backend; не перевірено весь спектр mobile HalfFloat/MSAA support.
- ResizeObserver оновлює projection, canvas і composer; zero dimensions guarded. Composer.setPixelRatio сам викликає setSize, після чого wrapper знову викликає setSize. Це зайві resize calls, але не доведений bottleneck; не причина переписувати pipeline.
- Moon shadow frustum ±9, near=1/far=28 покриває основну композицію; only moon casts shadows. У preview видно contact/architectural shadows без очевидного severe acne/peter-panning. Повний sweep усіх camera angles не виконувався.
- Standard/Physical materials адекватні, ARM R=AO/G=roughness; metalness каменю=0. Кеш включає path/colorSpace/repeat, тож color/data maps не змішуються. Geometry UV використано для плитки; Lucy не має UV і не отримує stone textures. Gate має власні PBR maps. Неправильного color-space подвоєння не виявлено.

## 7. GLSL ASSESSMENT

Seal справді procedural: distance bands, atan, angular marks, petals, derivative fwidth. Uniforms declared/updated з правильними scalar types; reset ставить activation/time у нуль. Plane на 0.012 вище altar top, depthTest=true/depthWrite=false, NormalBlending; у preview не видно z-fighting.

`atan(0,0)` математично невизначений на точному UV center; видимий дефект не відтворено. Це локальний shader edge case для майбутнього numeric hardening, не критична знахідка. В інших формулах smoothstep edges впорядковані; radius velocity division у controller має ненульовий orbit radius ≥.48 за поточної композиції. Particle denominator має max(.1, -z), particle height=2.6.

RitualEffects використовує дві shared ribbon meshes, aura cylinder, 96 points і pulse ring. Positions buffer створюється один раз, оновлюється тільки для видимих particles; нових geometry/materials у update немає. 96 CPU-updated particles — обмежена невелика робота, заміна particle library не виправдана. Materials transparent/additive, depthWrite=false; overlapping additive effects очікувані, не автоматична sorting помилка. Pixel-size sprites clamp 1–4 physical pixels: на HiDPI вони можуть виглядати дрібнішими, це visual tuning, не доведений rendering bug.

Шейдери компілювалися при фактичній активації High і Low, console warn/error порожня. Reduced motion вимикає ribbons/points/pulse і periodic movement; залишається повільна user-triggered зміна заряду/static aura та фізика. Реальний OS reduced-motion перемикач у браузері не тестувався; поведінка controller перевірена unit test.

## 8. RAPIER ASSESSMENT

WASM initialization promise один на module; World окремий на App. Ініціалізація awaited, abort перевіряється до/після World creation; late World free-иться. Runtime update не використовує World до готовності. Init rejection перехоплюється й показує reload message; promise cache не retry-иться без reload, що узгоджується з повідомленням.

Gravity −9.81, timestep 1/60, bounded accumulator/max 5 steps, CCD і damping для 8 small bodies. Release guard захищає від дублювання; controller припиняє scripted stone transforms після release. Bodies та meshes у root identity group, world/local coordinates збігаються. Nine static cuboids: ground, combined platform, four stairs, three altar sections. Bounds-based altar/platform відповідають видимим поверхням; ground не моделює кожний шов/перепад плитки. Декоративні gate, колони, статуї без колайдерів — свідоме спрощення цього ритуалу.

Reset removeRigidBody видаляє attached colliders, очищає bindings/accumulator; dispose звільняє World і є idempotent. Реальні Rapier tests перевіряють gravity, ground/altar contacts, rotation, 12 reset cycles, bounded long step і stale calls після free. Жодного physics replacement/mock замість цих сценаріїв немає. Виділення translation()/rotation() wrapper objects для 8 bodies не є підставою для архітектурного refactor без профілювання. F01 лишається відмінністю visual clock та simulation policy.

## 9. PERFORMANCE ASSESSMENT

Середовище: ChatGPT in-app browser на Windows, production preview `127.0.0.1:4173/?diagnostics=1`. Browser version/GPU backend не визначено; тест не заявляється як фізичний benchmark ASUS TUF A15 / RTX 4060. Viewport/drawing buffer 1440×900, DPR=1, початковий ракурс.

| Snapshot | Calls | Triangles | Geometries | Textures | Mean animation-frame interval |
| --- | ---: | ---: | ---: | ---: | ---: |
| High, initial idle | 255 | 483,678 | 43 | 22 | 6.95 ms |
| High, warmed idle після циклів/quality switches | 255 | 483,678 | 47 | 22 | 6.95 ms |
| Low idle | 242 | 483,665 | 47 | 22 | 6.94 ms |
| Mobile High 390×844 | 251 | 483,630 | 47 | 22 | 6.94 ms |

10 activation/reset завершено за приблизно 54.49 wall seconds із проміжком між двома batches; самі batches близько 17.79 і 17.84 s. Після першого використання VFX geometries 43→47 є очікуваним lazy GPU upload чотирьох buffers, а не доказом витоку. Після 5 і 10 циклів — 47/22; після п’яти пар High/Low і resize — також 47/22 у warmed High. Під час циклів були sampled 259 calls / 484,158 triangles; це не виміряний максимум усіх фаз.

Діагностика `App.ts:213–228` раз на 120 frames публікує render counters останнього кадру та mean raw interval за 119 інтервалів. Calls/triangles НЕ усереднюються; DOM ritual state може вже змінитися до наступного diagnostic snapshot. `renderer.info.reset()` викликається один раз перед composer; статистика включає shadow і postprocessing. Geometries/textures — кількість allocated resources, не bytes/VRAM. Interval — rAF scheduling, не GPU time/FPS guarantee; p95, GPU utilization, WASM heap не виміряні.

Суттєвий видимий geometry cost — дві Lucy instances і їхні shadow draws; shared geometry економить buffers, але не draw triangles. Shadow lights обмежені одним. CPU hot path не створює геометрії/шейдери, не рахує bounds/не traverse-ить сцену щокадру; particle update обмежений 96 points. Dense-mesh raycasting і world matrices оновлюються на завершення кліку, не кожний frame. Не доведено, що це bottleneck; BVH/decimation/postprocessing rewrite зараз не обґрунтовані.

Ручний hardware protocol: native resolution та Windows scaling; browser/version/active GPU; AC power/performance mode; cold-cache load time до Activate; High/Low по 2–5 хвилин із orbit і ritual; FPS/frame-time graph/p95 та GPU utilization, якщо доступні; десять reset включно з charge/fall; hidden→visible і resize; shader/console/network checks. Окремо повторити на фактичному HTTPS host. Full JS/GPU/WASM heap snapshots і mount/dispose stress залишаються неперевіреними.

## 10. ASSET AND LICENSE REVIEW

Поточні файли перевірені незалежно від історичного звіту: Lucy glTF має 1 mesh / 1 material / 100,000 indexed triangles / 50,002 vertices / 0 images. Gate — 4 meshes / 1 material / 38,140 triangles / 3 local JPEG maps. Ad hoc binary inspection перевірив усі triangle indices проти POSITION counts та bufferView bounds; існуючі тести — BIN lengths, локальні URI/JPEG headers/dimensions. Повний Khronos glTF Validator не встановлювався й не запускався.

Box3 normalization uniform, source mesh geometry не деформується; source clone shares geometry/materials. У browser ангели стоять на п’єдесталах, gate у rear arch на порозі; severe floating/clipping у перевірених видах не спостерігалося. Плитка інстансована за матеріалами, bounding volumes оновлені.

Lucy attribution присутня у README, ASSETS, bundled LICENSE.md та glTF copyright. За [Stanford repository terms](https://graphics.stanford.edu/data/3Dscanrep/) дозволене безкоштовне поширення з acknowledgement, commercial use потребує дозволу. Джерело окремо просить не анімувати/деформувати/руйнувати Lucy; у сцені ангели статичні, фізичні fragments — окремі примітиви. Для заявленої безкоштовної освітньої демонстрації не виявлено підтвердженого конфлікту з цими умовами; це висновок про відповідність описаному використанню, не необмежений дозвіл на майбутню комерційну експлуатацію.

Gate — Josh Dean, [офіційна сторінка](https://polyhaven.com/a/large_iron_gate), [CC0 Poly Haven](https://polyhaven.com/license). Stone maps зазначені як Plastered Stone Wall / Rob Tuytel, 512 WebP; metadata є в ASSETS, ARM channels відповідають code. Оригінальність source texture файлів не перевірялася повторним download/hash comparison. Не всі assets CC0: F04 потребує виправлення.

## 11. INTERACTION AND UI REVIEW

Raycaster використовує canvas-relative coordinates, recursive artifact hit, matrices перед raycast, visibility всього ancestor chain та foreground occlusion. Drag threshold 6 px, multi-touch/cancel guards; наявні unit tests перевіряють nested hits, drag-return, cancel, multi-touch, opaque blocker і hidden fallback. Rapid activate guard та reset під час заряджання перевірені tests/browser.

Browser: 10 full cycles; окремо Low activation/reset; mobile artifact click при прихованому menu → activating; Enter відновлює menu; Reset під час activation → idle; camera drag лишає idle. Hide/show використовує native hidden та aria-expanded/aria-controls; hidden controls зникають з AX tree. Кнопки native, focus-visible є; Space окремо в цьому аудиті не натискався. Physical multi-touch, screen reader і чисельний contrast audit не виконувалися.

390×844: page scroll 390×844, нема overflow. 320×320: menu clientHeight 234 / scrollHeight 314, внутрішній scrollbar, toggle bottom=304, кнопка відновлення доступна. На малому екрані орнамент/частина copy ховаються, сцена може частково закриватися panel; Hide UI забезпечує повний огляд. Це art-direction tradeoff, не підтверджений software defect.

## 12. TEST RESULTS

| Command / check | Спостережений результат |
| --- | --- |
| `npm run check` | PASS, exit 0 |
| `npm test` | PASS, 24/24, 0 failed/skipped |
| `npm run build` | PASS, exit 0; warning великих JS chunks, F05 |
| Binary glTF inspection | Обидва meshes: indices/bufferViews valid, counts наведено вище |
| Local HTTP HEAD | Lucy glTF/BIN, gate glTF, stone color та PhysicsWorld JS: 200; MIME відповідно model/gltf+json, application/octet-stream, image/webp, text/javascript |
| Browser production | Моделі, тіні, seal, charge/burst, Low/High, 10 reset cycles, UI/resize перевірені; console warn/error порожня |
| GitHub deployment metadata | Homepage порожня; deployments count=0; actual website URL не підтверджено |

Тести достатньо змістовні для невеликого проєкту: real Rapier і корисні coordinate/resource assertions. Loader tests закономірно mock-ять мережевий boundary, а не фізику. Обмеження: fake EventTarget не відтворює browser pointer capture/OrbitControls; model-files tests не є повною schema validation; tests не входять у tsc include; App/composer teardown немає (F03). Деякі tests створюють CPU-only Three resources без явного dispose — це не доказ runtime GPU leak, оскільки WebGL context там не створено. Немає підстав вимагати 100% coverage.

## 13. DEPLOYMENT READINESS

Статичний Vite build придатний для Vercel root deployment: output=dist, build=npm run build, lockfile присутній, сервер/секрети не потрібні. BASE_URL використано для models/textures, local dependencies збережені. Root preview HEAD/MIME та WASM initialization перевірено. Не-root hosting base, production CSP/compression/cache, Vercel install/build і cold network loading на фактичному URL не тестувалися.

Repository public не дорівнює public hosting. Вимога публічного застосунку ще не підтверджена; тому фінальну університетську здачу не можна назвати COMPLETE. Для некомерційного навчального deployment не знайдено поточного P0/P1 code blocker; можна переходити до контрольованого deployment після прийняття caveats та перевірки умов assets. Цей аудит нічого не деплоїть.

## 14. PRIORITIZED REMEDIATION ROADMAP

1. **Найменше наступне implementation task:** відокремити visual activation clock від physics clamp (F01), додати детерміновані 10/30/60/144 FPS та resume cases; перевірити без стрибка у момент release.
2. Повернути per-asset load outcomes і degraded state (F02); acceptance перевіряє реальні instances/response, а не тільки ready flag.
3. Додати вузький App lifecycle test: late init після dispose, teardown повторно, failed binding/setup (F03). Виправляти тільки підтверджені failure paths, не вводити lifecycle framework.
4. Узгодити DEPLOYMENT.md з Lucy terms і поточним GitHub status (F04).
5. Виконати hardware QA, контрольований HTTPS deployment та smoke test. Відобразити verified URL у документації; це необхідна умова остаточної здачі.
6. Лише після cold-load вимірів вирішувати F05; не починати з engine/package rewrite.

## 15. UNIVERSITY DEFENSE READINESS

Студент має вміти показати та пояснити:

- Що відрізняє geometry, material, mesh і scene graph; які об’єкти primitives, які імпортовані.
- Як GLTFLoader, Box3 centering/grounding та uniform scale розміщують Lucy/gate; які assets мають обмеження ліцензії.
- Чому albedo SRGB, а normal/ARM — linear; які ARM канали читає Three.js; чому Lucy матова без textures.
- Як hemisphere/moon/candle/ritual lights працюють і чому shadow casting лише у moon; вплив map size/bias/frustum.
- Що рендерить RenderPass, навіщо HDR/bloom/OutputPass, де рівно один ACES/SRGB output; різниця canvas AA та offscreen MSAA.
- Як GLSL малює rune rings без image, що таке UV/uniform/fwidth/alpha/depthWrite; чому VFX buffers не створюються щокадру.
- Де scripted charging закінчується й Rapier починає керувати stones; gravity, collider, rigid body, accumulator, CCD; що саме видаляє Reset.
- Як pointer click відрізняється від drag/multi-touch, як raycast враховує occlusion, як працюють hidden та aria-expanded.
- Що доводять 24 tests і 10 browser cycles, а чого не доводять renderer.info та успішний build.
- Продемонструвати фактичний HTTPS URL. Усна готовність самим аудитом не перевіряється.

**UNIVERSITY COMPLIANCE: PARTIAL** — дев’ять технічних пунктів PASS у перевіреному середовищі; public hosting та усний захист не підтверджені.

**TECHNICAL STABILITY: READY WITH CAVEATS** — немає відтворених P0/P1; F01–F03 потребують уваги.

**VISUAL AND PERFORMANCE VALIDATION: PARTIALLY VERIFIED** — поточні browser visuals/ресурсні лічильники перевірені, фізичний RTX 4060 benchmark/full heap profile не виконані.

**DEPLOYMENT: READY TO DEPLOY** — для контрольованого безкоштовного навчального hosting із зазначеними caveats; не DEPLOYED AND VERIFIED.

## Post-audit addendum — 9 листопада 2026 року

Перевірено локальні зміни поверх `e510dd76f00038623fbd7629199179df98989f67`. Секції вище зберігають результати аудиту від 8 листопада та його baseline.

| Знахідка | Поточний результат |
| --- | --- |
| F01 | Регресійні тести FrameClock проходять для 10/30/60/144 FPS, foreground stall і visibility pause/resume. |
| F02 | Виправлено. Loader повертає loaded/failed IDs окремих слотів, skipped procedural slots та missing paths. IDs містять індекс, тому два ангели мають різні ID. App відображає loading/ready/degraded/error і JSON-масиви в dataset. Помилки optional textures записуються окремо та зберігають матеріальні fallback. |
| F03 | Відтворено збій через fault injection у реєстрацію Reset. До виправлення RitualController.dispose не викликався. Додано rollback створеного controller та його груп, abort частково зареєстрованих interaction listeners, явне володіння stone geometry. Shared stone material звільняє App. Перевірено одноразове звільнення attached assets при пізньому завершенні іншого запиту. |
| F03, remount | Тест відтворив застарілий напис Quality Low після створення нового App з High. Ініціалізація синхронізує кнопку та очищає попередню діагностику. |
| F04 | DEPLOYMENT.md описує наявний опублікований repository, окремий static hosting, реальні glTF/BIN/image файли та Stanford terms для Lucy. Gate і stone textures мають CC0. |

### Файли

- `src/scene/assets.ts`, `src/scene/materials.ts` — structured outcomes та cleanup завантажених ресурсів.
- `src/core/App.ts`, `src/interaction/RitualController.ts` — readiness, rollback, teardown та remount.
- `src/main.ts`, `index.html`, `src/styles.css` — статус завантаження та повідомлення про degraded/error.
- `tests/app.test.ts`, `tests/assets.test.ts`, `tests/materials.test.ts`, `package.json` — сім App fixture tests, два asset regressions і один texture ownership regression, вбудований Node module mocking.
- `DEPLOYMENT.md`, цей addendum — актуальні інструкції та результати перевірки.

### Виконана перевірка

- `npm run check` — PASS.
- `npm test` — PASS, 43/43. Нові App fixtures виконують справжній App, RitualController, model і material loaders. WebGLRenderer, OrbitControls, composer wrapper, ResizeObserver, seal та асинхронний WASM boundary підмінено вузькими fixtures. Наявні physics/timing tests використовують справжній Rapier.
- Покрито dispose під час очікування PhysicsWorld.create, late asset completion, physics rejection після створення сцени, partial interaction binding failure, повторний dispose, shared material ownership, remount, відсутність активного loop після teardown та дубльованих button listeners.
- `npm run build` — PASS. Основний JS 731.44 kB / 186.29 kB gzip, physics chunk 4334.39 kB / 1670.06 kB gzip. Попередження Vite про великі chunks залишається.
- Вбудований браузер, dev `127.0.0.1:5173` та production preview `127.0.0.1:4173` — ready, три імпортовані instances, порожні failed/missing arrays; activation → released → Reset і High/Low працюють. Production Hide/Show UI працює. Після зміни source через Vite спостерігався один canvas і відновлений idle. Console warn/error порожня в обох режимах. Screenshot збережено поза repository у `D:/Projects/.tmp/chapel-audit/f02-f04-preview.png`.

### Межі перевірки та готовність

Fault injection моделей, текстур і partial binding виконано у Node fixtures. Перевірка GPU/composer teardown підтверджує виклики cleanup API через підміни. Повний GPU/heap leak profile, матриця реальних пристроїв та production HTTPS smoke test залишаються неперевіреними. `npm test` використовує experimental module-mocking API Node; прогін виконано на Node 26.8.1.

Локальна версія готова до контрольованого навчального static deployment із наведеними обмеженнями. Публічний HTTPS deployment залишається окремим етапом. Зміни цього addendum та відповідні виправлення підготовлено локально.
