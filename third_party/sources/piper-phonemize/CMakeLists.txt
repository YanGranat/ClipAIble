cmake_minimum_required(VERSION 3.27)
project(piper_phonemize_wasm LANGUAGES C CXX)

if(NOT EMSCRIPTEN)
  message(FATAL_ERROR "Build with the pinned Emscripten toolchain")
endif()
foreach(variable PIPER_SOURCE ESPEAK_SOURCE SONIC_SOURCE ESPEAK_DATA)
  if(NOT DEFINED ${variable})
    message(FATAL_ERROR "Missing ${variable}")
  endif()
endforeach()
add_compile_options("-g0" "-ffile-prefix-map=${PIPER_SOURCE}=piper-phonemize" "-ffile-prefix-map=${ESPEAK_SOURCE}=espeak-ng")

set(BUILD_SHARED_LIBS OFF CACHE BOOL "" FORCE)
set(USE_ASYNC OFF CACHE BOOL "" FORCE)
set(USE_MBROLA OFF CACHE BOOL "" FORCE)
set(USE_LIBSONIC OFF CACHE BOOL "" FORCE)
set(USE_LIBPCAUDIO OFF CACHE BOOL "" FORCE)
set(USE_KLATT OFF CACHE BOOL "" FORCE)
set(USE_SPEECHPLAYER OFF CACHE BOOL "" FORCE)
set(FETCHCONTENT_SOURCE_DIR_SONIC-GIT "${SONIC_SOURCE}" CACHE PATH "" FORCE)
add_subdirectory("${ESPEAK_SOURCE}" espeak)

add_executable(piper_phonemize
  "${PIPER_SOURCE}/src/main.cpp"
  "${PIPER_SOURCE}/src/phoneme_ids.cpp"
  "${PIPER_SOURCE}/src/phonemize.cpp"
  "${PIPER_SOURCE}/src/shared.cpp")
target_compile_features(piper_phonemize PRIVATE cxx_std_17)
target_include_directories(piper_phonemize PRIVATE
  "${PIPER_SOURCE}/src"
  "${ESPEAK_SOURCE}/src/include")
target_link_libraries(piper_phonemize PRIVATE "$<LINK_ONLY:espeak-ng>" ucd)
target_link_options(piper_phonemize PRIVATE
  "-O3"
  "-g0"
  "-sINVOKE_RUN=0"
  "-sMODULARIZE=1"
  "-sEXPORT_NAME=createPiperPhonemize"
  "-sEXPORTED_FUNCTIONS=['_main']"
  "-sEXPORTED_RUNTIME_METHODS=['callMain','FS']"
  "--preload-file" "${ESPEAK_DATA}@/espeak-ng-data")
