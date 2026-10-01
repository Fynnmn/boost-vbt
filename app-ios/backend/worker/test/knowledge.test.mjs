// Conocimiento de Nova (src/knowledge.js): elige las fichas correctas para cada pregunta.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { relevantKnowledge } from '../src/knowledge.js';

const first = q => relevantKnowledge(q).split('\n')[0];

test('cada pregunta trae la ficha que corresponde', () => {
  assert.match(first('¿Cuántas series hago para crecer?'), /Schoenfeld, Ogborn y Krieger/);
  assert.match(first('¿me conviene tomar creatina?'), /creatina monohidrato/);
  assert.match(first('¿cuánto descanso entre series?'), /Descanso entre series/);
  assert.match(first('dormí mal, ¿entreno igual?'), /Sueño/);
  assert.match(first('tengo 16, ¿puedo hacer pesas?'), /Jóvenes/);
  assert.match(first('¿qué dice la ciencia de cortar al 20 %?'), /Pareja-Blanco/);
});

test('palabras cortas no se cuelan dentro de otras ("rm" en "dormí")', () => {
  assert.doesNotMatch(relevantKnowledge('dormí mal'), /1RM con velocidad/);
});

test('sin coincidencias: lo básico de VBT; nunca más de 3 fichas', () => {
  assert.match(relevantKnowledge('hola'), /^- VBT/);
  assert.ok(relevantKnowledge('fuerza potencia volumen series descanso sueño creatina').split('\n').length <= 3);
});

test('fichas nuevas (Nova Research): frases de atleta traen la ficha correcta', () => {
  const has = (q, re) => assert.match(relevantKnowledge(q), re, q);
  has('¿qué velocidad miro, la pico o el promedio?', /Morán-Navarro/);
  has('me quedé clavado en peso muerto, ¿cuál es el mínimo?', /0,24 de velocidad media/);
  has('la app me tiró un 1RM raro, ¿es exacto?', /Banyard/);
  has('¿sirve ver el numerito en la pantalla?', /Weakley y col., 2023/);
  has('me clavé unas birras anoche', /Parr y col., 2014/);
  has('estoy con parciales y re estresado', /Stults-Kolehmainen/);
  has('orino oscuro y tengo los brazos hinchados', /Rabdomiólisis/);
  has('me hago pis cuando levanto pesado', /piso pélvico/);
  has('volví después de vacaciones, ¿arranco con todo?', /Gabbett/);
  has('estoy embarazada, ¿puedo seguir con sentadillas?', /Prevett/);
  has('quiero volcarla, ¿qué hago para saltar más?', /Liao/);
  has('¿qué ejercicios me dan un saque más rápido en tenis?', /Deng/);
  has('¿tengo que tomar el batido apenas termino?', /Schoenfeld, Aragon y Krieger/);
  has('¿sirve la glutamina?', /Candow/);
  has('me duele el codo, tengo codo de tenista', /Karanasios|Lewis/);
});

test('las citas corregidas de los informes no vuelven a aparecer', () => {
  const all = ['vbt', 'velocidad pico', 'mínimo peso muerto', '1rm estimado', 'feedback pantalla', 'intención velocidad potencia'].map(q => relevantKnowledge(q)).join(' ');
  assert.doesNotMatch(all, /Benavides-Ubric|Kellyanne|Davenport|0,35 m\/s/);
});
