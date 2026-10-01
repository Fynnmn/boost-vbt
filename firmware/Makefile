# Harness de PC. Compila src/algo/ con g++ para iterar el algoritmo contra el
# dataset sin tocar la placa.
#
# Necesita g++ en el PATH. Esta maquina todavia no lo tiene: ver README.md.

CXX      ?= g++
CXXFLAGS := -std=gnu++17 -Wall -Wextra -O2 -g -Isrc -DVBT_HOST_BUILD
BUILD    := build

# En Windows el binario necesita .exe o el shell se niega a ejecutarlo.
ifeq ($(OS),Windows_NT)
  EXE := .exe
else
  EXE :=
endif

ALGO_SRC := $(wildcard src/algo/*.cpp)
# Los headers van como dependencia si o si: TODOS los umbrales del algoritmo
# viven en algo/config.h, y sin esto un cambio de umbral no recompila nada y
# uno se pasa media hora midiendo el binario viejo.
HEADERS  := $(wildcard src/algo/*.h) $(wildcard src/ble/*.h) $(wildcard src/drivers/*.h) $(wildcard src/storage/*.h) $(wildcard src/app/*.h)

.PHONY: all test replay metrics formato params volcado clean check-compiler

all: test

check-compiler:
	@command -v $(CXX) >/dev/null 2>&1 || { \
	  echo "ERROR: no hay '$(CXX)' en el PATH."; \
	  echo "Instala w64devkit (portable, sin instalador) o MSYS2. Ver README.md."; \
	  exit 1; }

test: check-compiler $(BUILD)/test_protocol$(EXE) $(BUILD)/test_lsm6ds3tr$(EXE) $(BUILD)/test_log_store$(EXE) $(BUILD)/test_state_machine$(EXE) $(BUILD)/test_app$(EXE) $(BUILD)/test_vbt_service$(EXE) $(BUILD)/test_log_dumper$(EXE)
	@$(BUILD)/test_protocol$(EXE)
	@$(BUILD)/test_lsm6ds3tr$(EXE)
	@$(BUILD)/test_log_store$(EXE)
	@$(BUILD)/test_state_machine$(EXE)
	@$(BUILD)/test_app$(EXE)
	@$(BUILD)/test_vbt_service$(EXE)
	@$(BUILD)/test_log_dumper$(EXE)

# Volcado del log por BLE, contra una flash falsa y un stack falso. Vive en
# app/log_dumper.cpp y no en main.cpp justamente para que esto sea posible.
$(BUILD)/test_log_dumper$(EXE): test/host/test_log_dumper.cpp src/app/log_dumper.cpp src/ble/vbt_service.cpp src/storage/log_store.cpp $(HEADERS) | $(BUILD)
	$(CXX) $(CXXFLAGS) -o $@ $(filter %.cpp,$^)

# Verifica que protocol.h coincida byte a byte con docs/PROTOCOL.md.
$(BUILD)/test_protocol$(EXE): test/host/test_protocol.cpp $(HEADERS) | $(BUILD)
	$(CXX) $(CXXFLAGS) -o $@ $<

# Verifica el driver del IMU contra un bus I2C falso, sin necesitar la placa.
$(BUILD)/test_lsm6ds3tr$(EXE): test/host/test_lsm6ds3tr.cpp src/drivers/lsm6ds3tr.cpp $(HEADERS) | $(BUILD)
	$(CXX) $(CXXFLAGS) -o $@ test/host/test_lsm6ds3tr.cpp src/drivers/lsm6ds3tr.cpp

# Verifica el logger contra una flash NOR simulada, sin necesitar la placa.
$(BUILD)/test_log_store$(EXE): test/host/test_log_store.cpp src/storage/log_store.cpp $(HEADERS) | $(BUILD)
	$(CXX) $(CXXFLAGS) -o $@ test/host/test_log_store.cpp src/storage/log_store.cpp

# Verifica el flujo de uso completo (docs/DECISIONS.md D1-D4) sin la placa.
$(BUILD)/test_state_machine$(EXE): test/host/test_state_machine.cpp src/app/state_machine.cpp $(HEADERS) | $(BUILD)
	$(CXX) $(CXXFLAGS) -o $@ test/host/test_state_machine.cpp src/app/state_machine.cpp

# LED, bateria y presupuesto de energia.
$(BUILD)/test_app$(EXE): test/host/test_app.cpp src/app/led.cpp src/app/battery.cpp src/app/power.cpp src/app/state_machine.cpp $(HEADERS) | $(BUILD)
	$(CXX) $(CXXFLAGS) -o $@ $(filter %.cpp,$^)

# Servicio BLE contra un stack falso: payloads, comandos basura y MTU chico.
$(BUILD)/test_vbt_service$(EXE): test/host/test_vbt_service.cpp src/ble/vbt_service.cpp src/app/state_machine.cpp $(HEADERS) | $(BUILD)
	$(CXX) $(CXXFLAGS) -o $@ $(filter %.cpp,$^)

# Corre el detector de reps sobre un archivo del dataset.
#   make replay ARCHIVO=dataset/raw/2026-09-20_banca/set_01.bin
replay: check-compiler $(BUILD)/replay$(EXE)
	@$(BUILD)/replay$(EXE) $(ARCHIVO)

# Mide el detector contra TODO el dataset. Recompila primero a proposito:
# medir un binario viejo despues de tocar un umbral hace perder media hora.
metrics: check-compiler $(BUILD)/replay$(EXE)
	@python tools/metrics.py $(DATASET) $(ARGS)

DATASET ?= dataset/raw/synth

# Verifica que el `.vbt` que escribe la app (app/js/imu.js) siga alineado con
# el header de docs/DATASET.md. Si un offset se corre, replay.exe no da error:
# lee basura y sigue. Por eso se comprueba a proposito y no por casualidad.
formato: check-compiler $(BUILD)/replay$(EXE)
	@cd ../tools && node gen_vbt_prueba.mjs
	@python tools/check_formato.py

# La cadena completa de la descarga del log: simulador -> app -> .vbt ->
# replay.exe. Cada capa tiene sus tests; esto prueba que encajen, que es
# donde aparece el peor modo de falla: un archivo que abre sin error y tiene
# los datos corridos.
volcado: check-compiler $(BUILD)/replay$(EXE)
	@cd ../tools && node check_volcado.mjs

# La tabla de parametros vive en protocol.h y la app la espeja en
# js/params.js. Si se separan, la app ofrece rangos que el sensor rechaza.
params:
	@cd ../tools && node check_params.mjs

$(BUILD)/replay$(EXE): test/host/replay_main.cpp $(ALGO_SRC) $(HEADERS) | $(BUILD)
	$(CXX) $(CXXFLAGS) -o $@ $(filter %.cpp,$^)

$(BUILD):
	@mkdir -p $(BUILD)

clean:
	@rm -rf $(BUILD)
