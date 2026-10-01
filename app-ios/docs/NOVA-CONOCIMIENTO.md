# Conocimiento de Nova

Actualizado el 27/9/2026 con los 5 informes de "Nova Research" (Gemini Deep Research): VBT, fuerza aplicada a deportes, fuerza e hipertrofia, fatiga y recuperación, y seguridad.

Nova no se re-entrena. En `backend/worker/src/knowledge.js` hay 53 fichas cortas con evidencia, y en cada pregunta recibe las 3 más relevantes, elegidas por palabras clave. Las palabras clave incluyen las frases de atleta de los informes ("me quedé clavado", "me clavé unas birras").

## Cómo se verificó

Los informes traen unas 150 fichas y mezclan estudios sólidos con fuentes flojas (blogs, una página de Facebook, sitios de suplementos) y citas mal armadas. Cada cita que quedó en una ficha se comprobó contra PubMed (E-utilities: autor, año, revista y el dato del resumen) o contra Crossref para revistas que PubMed no indexa. Lo que no se pudo verificar quedó afuera.

## Errores encontrados en los informes (corregidos o descartados)

| Informe decía | Realidad verificada |
|---|---|
| Peso muerto: "Benavides-Ubric et al., 2020", velocidad en el 1RM ~0,35 m/s | Es Morán-Navarro y col., 2021 (Eur J Sport Sci); velocidad media en el 1RM **0,24 m/s** |
| Banyard 2017: el perfil individual estima el 1RM con error < 3 kg | Banyard concluye lo contrario: **no predijo el 1RM con precisión** (la velocidad del 1RM varió 22,5 % entre días) |
| Umbral mínimo óptimo: "García-Ramos et al., 2023" | Es Fitas y col., 2024 (Int J Sports Med), con límites de acuerdo de ~15 kg |
| Feedback: "Weakley et al., 2019, meta-análisis" | El meta-análisis es de **2023** (Sports Medicine); el de 2019 es otro estudio en rugby |
| Embarazo: "Davenport et al., 2024" | Es Prevett y col., 2025 (BJSM) |
| Tenis: "Deng et al., 2025" | Es 2024 (Front Physiol) |
| Sprint: "Seitz et al., 2012, JSCR" (PMID de otro estudio, Lockie 2012) | El meta-análisis es Seitz y col., 2014 (Sports Medicine) |
| Baz-Valle 2022 en Sports Medicine | Es J Hum Kinet |
| Liao 2022 en Frontiers | Es Biol Sport |
| "Grgic & Schoenfeld 2020" (fibras) | Es Grgic, 2020, único autor |
| Refalo 2022 como meta-análisis | El meta-análisis es Refalo y col., 2023 (Sports Medicine) |
| Wolf 2023 (rango de movimiento) con un DOI | El DOI era de otro trabajo; el real es Int J Strength Cond 2023 |
| "Kellyanne et al. (2021)" (rugby) | "Kellyanne" es un nombre de pila: cita descartada |
| CrossFit: Klimek 2021, 3,2 lesiones/1000 h | No se encontró en PubMed ni Crossref: descartado |
| Handball: Hermassi 2023 | No se encontró: descartado |
| Estudios "2026/Reciente" (Bautista; Sánchez-Medina en J Hum Kinet) | Sin datos verificables: descartados |
| Mujeres hacen "30–40 % más reps" hasta la misma pérdida de velocidad | Sin cita verificable: descartado |
| Ficha vieja: intención de velocidad "González-Badillo y col., 2014" | Es Pareja-Blanco y col., 2014 (Int J Sports Med) |

## Lo que se dejó afuera a propósito

- **Dosis médicas:** vitamina D (1.000–4.000 UI), bicarbonato por kilo, "suspender el ibuprofeno". Nova deriva a un profesional.
- **Creatina en menores:** el informe la recomendaba con 3–5 g. Nova mantiene "con el médico o nutricionista".
- **Consejos de rehabilitación con números** ("seguir si el dolor es ≤ 3/10"): no se verificó la fuente y es tarea del fisioterapeuta.
- **Parámetros de BFR** (presión, series): solo se dice que funciona y que se hace con un profesional.

## Seguridad

- La rabdomiólisis tiene ficha propia.
- El filtro de síntomas (`src/velo/fatigue.js`) ahora detecta la orina oscura dicha de varias formas ("orino color té", "hice pis oscuro", "orino con sangre") y responde con el mensaje fijo de urgencia, sin IA.
- "Me hago pis cuando levanto" no dispara urgencia: va a la ficha de piso pélvico.

## Pruebas

- `backend/worker/test/knowledge.test.mjs`: frases de atleta que tienen que traer la ficha correcta, y que las citas corregidas no vuelvan.
- `backend/worker/test/fatigue.test.mjs`: formas de decir "orina oscura".
