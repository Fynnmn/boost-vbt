// Definiciones de la placa: pines, escalas y las trampas conocidas.
//
// ESTE ARCHIVO ES EL PRIMERO A VERIFICAR EL DIA 1 CON LA PLACA EN LA MANO.
// Todo lo que hay aca sale del variant.h del board package de Seeed y de la
// documentacion, NO de haberlo probado. Los numeros de pin cambian entre
// revisiones de placa.
//
// Checklist del dia 1 (ver docs/BRINGUP.md):
//   1. Abrir el variant.h real del board package instalado.
//   2. Comparar cada constante de aca contra el archivo.
//   3. Anotar en docs/DECISIONS.md cualquier diferencia.

#pragma once

#ifdef VBT_TARGET_NRF52

#include <Arduino.h>

namespace vbt {
namespace platform {

// --- IMU ------------------------------------------------------------------
// TRAMPA NUMERO UNO DE ESTA PLACA: el LSM6DS3TR esta alimentado por un GPIO
// dedicado. Hay que ponerlo en ALTO y esperar antes de hablarle por I2C. Si
// no, el bus no contesta nada y parece que la placa vino fallada.
#ifdef PIN_LSM6DS3TR_C_POWER
constexpr uint8_t kPinImuPower = PIN_LSM6DS3TR_C_POWER;
#else
constexpr uint8_t kPinImuPower = (1 + 8);  // P1.08 -- VERIFICAR
#endif

#ifdef PIN_LSM6DS3TR_C_INT1
constexpr uint8_t kPinImuInt1 = PIN_LSM6DS3TR_C_INT1;
#else
constexpr uint8_t kPinImuInt1 = (0 + 11);  // P0.11 -- VERIFICAR
#endif

constexpr uint32_t kImuPowerUpDelayMs = 20;

// --- LED RGB --------------------------------------------------------------
// TRAMPA NUMERO DOS: el LED es de ANODO COMUN. Poner el pin en LOW ENCIENDE.
// Es al reves de lo que uno espera, y el sintoma es que arranca todo prendido
// y queda apagado justo cuando deberia iluminar.
//
// La inversion se hace en UN solo lugar: writeLed() en platform.cpp.
constexpr uint8_t kPinLedRed = LED_RED;
constexpr uint8_t kPinLedGreen = LED_GREEN;
constexpr uint8_t kPinLedBlue = LED_BLUE;

// --- Bateria --------------------------------------------------------------
// El divisor de tension se habilita por un GPIO (activo en BAJO) y se lee por
// un pin analogico. La relacion del divisor tambien hay que verificarla: en la
// XIAO nRF52840 son 1 MOhm y 510 kOhm, o sea que el ADC ve Vbat * 510/1510.
#ifdef VBAT_ENABLE
constexpr uint8_t kPinVbatEnable = VBAT_ENABLE;
#else
constexpr uint8_t kPinVbatEnable = (0 + 14);  // P0.14 -- VERIFICAR
#endif

#ifdef PIN_VBAT
constexpr uint8_t kPinVbat = PIN_VBAT;
#else
constexpr uint8_t kPinVbat = (0 + 31);  // P0.31 / A6 -- VERIFICAR
#endif

// Vadc = Vbat * 510 / 1510  ->  Vbat = Vadc * 1510 / 510 = Vadc * 2,961
constexpr float kVbatDividerRatio = 1510.0f / 510.0f;

// Referencia interna de 3,0 V y 12 bits: 4096 cuentas para 3,0 V.
constexpr float kAdcVoltsFullScale = 3.0f;
constexpr uint16_t kAdcCounts = 4096;
constexpr uint8_t kBatteryAverageSamples = 16;

// --- Tiempos del lazo principal -------------------------------------------
constexpr uint32_t kStatusIntervalMs = 10000;   // Status por BLE
constexpr uint32_t kBatteryIntervalMs = 30000;  // lectura de bateria
constexpr uint32_t kLedUpdateMs = 20;

}  // namespace platform
}  // namespace vbt

#endif  // VBT_TARGET_NRF52
