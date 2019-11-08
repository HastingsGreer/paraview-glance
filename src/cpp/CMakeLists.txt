
cmake_minimum_required(VERSION 3.10)

project(Hello)

set(io_components ITKImageIO)
if(EMSCRIPTEN)
  set(io_components BridgeJavaScript)
endif()
find_package(ITK REQUIRED
  COMPONENTS ${io_components}
    ITKSmoothing
  )
include(${ITK_USE_FILE})

set(hello_SRCS hello.cxx)
if(EMSCRIPTEN)
  include(ITKBridgeJavaScript)
  web_add_executable(hello ${hello_SRCS})

else()
  add_executable(hello ${hello_SRCS})
endif()

target_link_libraries(hello ${ITK_LIBRARIES})

