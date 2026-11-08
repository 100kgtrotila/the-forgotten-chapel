# Фінальний технічний аудит

Цей звіт фіксує перевірку Stage 5 до заміни статуй на Lucy. Наведені нижче лічильники рендерингу та опис старої моделі не є вимірами нової сцени. Поточні моделі й умови використання наведено в `ASSETS.md`; після заміни повторно пройдено 23 тести, TypeScript, build та browser smoke test ритуалу/Reset.

## Висновок

Проєкт готовий до фінальної перевірки на цільовому ноутбуці та подальшого статичного деплою. Підтверджених CRITICAL/HIGH дефектів не виявлено. Деплой не виконувався. Перевірено фактичний код, локальні ресурси, dev-сервер і production preview у вбудованому браузері.

## Дев’ять вимог

| Вимога | Статус | Реалізація та перевірені докази |
| --- | --- | --- |
| Примітиви | PASS | `src/scene/createChapel.ts:createChapel`, `createArchitecture.ts:createArchitecture`: видимі Box/Cylinder/Sphere/Plane/Torus, інстансована бруківка. |
| Складні імпортовані моделі | PASS | `src/scene/assets.ts:loadModelSlots/createModelInstance`, `createArchitecture.ts`: дві статуї та задня брама реально відображені. `public/models/gothic_statue/gothic_statue.gltf` — 27 739 трикутників; `public/models/large_iron_gate/large_iron_gate.gltf` — 38 140. Тести перевіряють індекси, BIN, локальні URI й JPEG-залежності. |
| Матеріали | PASS | `src/scene/materials.ts:createChapelMaterials`: MeshStandard/PhysicalMaterial; base color sRGB, normal/ARM лінійні; ARM R→AO, G→roughness. Тести підтверджують колірні простори, кеш і fallback. Імпортовані PBR матеріали збережені. |
| Освітлення | PASS | `src/scene/createLighting.ts:createLighting`: холодне directional, hemisphere fill, чотири теплі point lights із decay=2. Внесок видно у preview. |
| Тіні | PASS | `src/core/App.ts`, `createLighting.ts`, `assets.ts`: PCFShadowMap, одна directional shadow 1024 High / 512 Low; меші cast/receiveShadow. Тіні вівтаря, колон і статуй видно у браузері. |
| Анімація | PASS | `App.animate`, `RitualController.update`: один центральний цикл, delta/elapsed для плавання, обертання, мерехтіння й станів ритуалу. Рух спостерігався між кадрами. |
| Фізика | PASS | `src/physics/PhysicsWorld.ts`: справжній Rapier WASM, gravity −9.81, dynamic rigid bodies, ball/cuboid colliders, контакти й обертання. Unit-тести реальної симуляції та падіння на вівтар у браузері. |
| Якісний рендеринг | PASS | `src/core/RenderingPipeline.ts`, `App.ts`: HDR HalfFloat, MSAA 2 High, RenderPass→UnrealBloomPass→OutputPass, ACES/sRGB, обмежений DPR, responsive resize. Обидві якості працюють у preview. Це не гарантія FPS на всіх пристроях. |
| Власний шейдер | PASS | `src/effects/MagicSeal.ts`, `src/shaders/magicSeal.vert.glsl`, `magicSeal.frag.glsl`: власні GLSL, ShaderMaterial, процедурні кільця/мітки без текстур, uTime/uIntensity/uActivation. Видно анімацію й реакцію на активацію; повідомлень про помилки компіляції немає. |

## Знахідки та зміни

Класифікація виконана до редагування коду:

| Рівень | Знахідка | Дія / залишкове обмеження |
| --- | --- | --- |
| CRITICAL | Не виявлено | Базові check, 21 тест і build успішні ще до змін. |
| HIGH | Не виявлено | Не відтворено зламаної взаємодії, дублювання тіл, major rendering defects або накопичення GPU-ресурсів у перевірених циклах. Це не повний heap-профіль. |
| MEDIUM | Діагностика не містила geometries/textures і розміру drawing buffer | Доповнено наявний opt-in режим у `src/core/App.ts`. У звичайному режимі додатковий збір не виконується. README оновлено. |
| MEDIUM | Великі production chunks | Залишено явно задокументованими: основний JS 720.54 kB / 183.46 kB gzip; асинхронний Rapier compat 4 334.39 kB / 1 670.06 kB gzip. Vite попереджає про >500 kB. Без заміни пакета/формату WASM штучне дроблення не зменшить цей обсяг; це ціна першого завантаження, не build failure. |
| LOW | Підтверджених косметичних дефектів у перевірених ракурсах немає | Художню композицію, моделі та математику шейдера не змінено. |

Додано перевірку в `tests/physics.test.ts`: після `dispose()` виклики release/step/reset і повторний dispose безпечні та не змінюють меш. Це додаткове покриття вже наявного контракту, а не твердження про раніше зламану поведінку.

## Життєвий цикл Rapier та ресурсів

- `PhysicsWorld.create` кешує тільки WASM initialization promise; кожен App володіє окремим World. Асинхронна ініціалізація перевіряє abort до та після створення World. Помилка ініціалізації перехоплюється з повідомленням і вимкненням кнопок.
- Крок 1/60 s, обмежений accumulator і максимум 5 substeps; App додатково обмежує delta до 0.05 s. Після тривалої паузи час навмисно не наздоганяється повністю.
- Контролер має idle→activating→released; повторна активація заблокована. Вісім каменів живуть в identity-transform group, тому mesh/body координати узгоджені. Статичні колайдери вівтаря/сходів обчислюються з bounds, платформа враховує інстансовану плитку.
- Reset видаляє dynamic bodies разом із colliders, очищає accumulator і відновлює трансформації та uniforms. Unit-тест проходить 12 циклів і перевіряє кількість тіл/колайдерів; браузер — 10 повних циклів UI.
- `App.dispose` зупиняє loop, abort-ить listeners/завантаження, від’єднує ResizeObserver/Controls, звільняє World, seal, passes, composer targets, scene resources, shadow map і renderer. `disposeObjectResources` дедуплікує спільні geometry/material/texture та звільняє instance buffers. Тести перевіряють shared cleanup і пізнє завершення assets після teardown.
- Повний GPU/JS/WASM heap-профіль та багаторазовий HMR teardown у браузері не виконувалися; сталі лічильники під час Reset не доводять відсутності всіх можливих витоків.

## Рендеринг, шейдер та ресурси

У `App.animate` немає другого прямого renderer.render. `renderer.info` скидається перед повним composer frame, тому draw calls/triangles включають shadow і fullscreen passes, а не лише основну сцену. Перевірено встановлений код Three.js: проміжний HDR target використовує лінійний простір без material tone mapping; OutputPass виконує кінцеві ACES/sRGB. Подвійної gamma-конвертації не виявлено.

Seal — одна невелика площина 1.62×1.62, без texture sampling, з fwidth-антиаліасингом; alpha blending, depthTest=true, depthWrite=false. Позиція на 0.012 вище вівтаря запобігає z-fighting. У High MSAA налаштований на composer targets; antialias canvas сам по собі не згладжував би postprocessing. Low вимикає bloom і MSAA, зберігаючи фізику/шейдер.

Статуї стоять на п’єдесталах, брама — за вівтарем; неправильного масштабу/орієнтації чи очевидних перетинів у перевірених ракурсах не видно. Бруківка інстансована, ресурси моделей спільні, textures моделей 1K, каменю 512. Неактивні slots арок/колон чесно мають path=null і процедурну геометрію. Імпортовані декорації не мають physics colliders; ball colliders каменів і плоский ground — спрощення, не точна геометрія всього двору.

Автори та CC0 підтверджені офіційними сторінками [Gothic Statue](https://polyhaven.com/a/gothic_statue), [Large Iron Gate](https://polyhaven.com/a/large_iron_gate) і [ліцензії Poly Haven](https://polyhaven.com/license). Локальні шляхи, залежності й атрибуція описані в `ASSETS.md`.

## Вимірювання у браузері

Production preview, вбудований браузер ChatGPT на Windows; модель GPU та версію браузера під час цього вимірювання не встановлено. Це не підтверджений тест на RTX 4060. Початковий ракурс, assets=ready, DPR=1, viewport/drawing buffer 1920×1080:

| Якість | Calls/frame | Triangles/frame | Geometries | Textures | Середній інтервал animation frames |
| --- | ---: | ---: | ---: | ---: | ---: |
| High | 295 | 195 730 | 43 | 25 | приблизно 6.94 ms |
| Low | 282 | 195 717 | 43 | 25 | приблизно 6.94–6.95 ms |

Кожний знімок діагностики агрегує інтервал за 120 кадрів. Це wall-clock scheduling, не GPU execution time; окремий CPU cost Rapier, GPU utilization, p95 та довготривалу frame stability не профільовано. FPS цільового ноутбука з цих чисел не виводиться. Кількості ресурсів — не обсяг пам’яті у байтах. У Low раніше виділені bloom targets можуть лишатися до resize/dispose; після mobile resize textures зменшилися до 14.

У production 1280×720 до/після 10 циклів: 43 geometries / 25 textures, idle відновлюється; зростання цих лічильників не виявлено. П’ять пар High→Low→High не дали помилок. Один shadow-casting light; candle shadows вимкнені. Нові GPU-ресурси не створюються в animation loop.

## Перевірки

| Перевірка | Фактичний результат |
| --- | --- |
| `npm run check` | PASS, strict TypeScript, exit 0 |
| `npm test` | PASS, 22/22, 0 failed / skipped |
| `npm run build` | PASS, exit 0; є задокументоване chunk-size warning |
| Dev `127.0.0.1:5173` | Assets ready, shader/моделі видимі, activation/released/reset працюють, warn/error console порожня |
| Production `127.0.0.1:4173` | Assets ready, моделі/тіні/seal видимі, клік артефакту активує, drag лишає idle, 10 activation/reset циклів, High/Low працездатні |
| Колізії | У браузері камені після падіння лежать на вівтарі; unit-тести gravity, ground/altar contacts, rotations і body cleanup успішні |
| Resize | 1920×1080 і 390×844; canvas/diagnostics розміри оновлюються; на mobile scrollWidth/Height = clientWidth/Height, кнопки доступні |
| Консоль | У dev і production немає зафіксованих warn/error, зокрема shader compile або model-load errors |
| Rapid/multi-touch/cancel/occlusion | Unit-тести забороняють дубльовану активацію, drag-return, canceled/multi-touch та клік крізь видимий blocker; фізичний touch-пристрій не перевірявся |

Окремих lint/format scripts у package.json немає. Після змін повторено check, test і build. Нові залежності не додавалися.

## Ручна перевірка ASUS TUF A15 / RTX 4060 Laptop

- [ ] Записати native resolution, Windows scaling, браузер/версію та активну GPU; живлення від мережі й обраний режим продуктивності.
- [ ] Пройти High і Low у native resolution; записати FPS, типові frame times, помітні стрибки протягом 2–5 хвилин; за можливості GPU utilization.
- [ ] Перевірити холодне завантаження з очищеним cache: моделі/текстури, час готовності ритуалу та відсутність console/network errors.
- [ ] Оглянути shader, bloom, тіні й краї геометрії при orbit/zoom/resize; перевірити reduced-motion у налаштуваннях ОС.
- [ ] Клік артефакту, швидкі повторні кліки, drag, keyboard buttons; падіння/обертання/контакти всіх восьми каменів.
- [ ] Не менше 10 activation/reset, зокрема Reset під час activation і падіння; повернення idle, відсутність дублікатів/накопичення пам’яті.
- [ ] Після майбутнього деплою повторити smoke test на фактичному HTTPS URL та перевірити HTTP/MIME усіх assets.

## Деплой

Відомих технічних блокерів немає. Потрібна зазначена апаратна QA та перевірка фактичного hosting URL після публікації; результати не підмінені localhost-тестами. `DEPLOYMENT.md` описує статичний dist і build command. Сайт не опубліковано; commit/push не виконано.

**READY FOR DEPLOYMENT** — за умови фінальної hardware QA та smoke test після публікації.
