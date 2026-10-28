cmake_minimum_required(VERSION 3.21)
project(groubot_cef_host LANGUAGES C CXX)

set(CEF_ROOT "$ENV{GROUBOT_CEF_ROOT}" CACHE PATH "CEF binary distribution")
if(NOT CEF_ROOT)
  message(FATAL_ERROR "Set GROUBOT_CEF_ROOT to the tested CEF distribution")
endif()

set(CMAKE_MODULE_PATH "${CEF_ROOT}/cmake")
find_package(CEF REQUIRED)
add_subdirectory("${CEF_LIBCEF_DLL_WRAPPER_PATH}" libcef_dll_wrapper)

add_executable(groubot-cef-host
  src/main.cc
  src/cef_application.cc
  src/cef_browser_client.cc
  src/cef_render_process_handler.cc
  src/command_channel.cc
)
target_compile_features(groubot-cef-host PRIVATE cxx_std_20)
target_compile_definitions(groubot-cef-host PRIVATE CEF_USE_SANDBOX=0)
target_include_directories(groubot-cef-host PRIVATE "${CEF_INCLUDE_PATH}" src)
target_link_libraries(groubot-cef-host PRIVATE libcef_dll_wrapper ${CEF_LIB_RELEASE} X11 Xext pthread dl)

set_target_properties(groubot-cef-host PROPERTIES
  BUILD_RPATH "${CEF_BINARY_DIR_RELEASE}"
  INSTALL_RPATH "${CEF_BINARY_DIR_RELEASE}"
  RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/Release"
)

add_custom_command(TARGET groubot-cef-host POST_BUILD
  # Keep libcef.so in the persistent CEF SDK. The executable has an RPATH to
  # that directory, so copying this 1.4 GB library into every build is wasteful
  # and can exhaust the user's disk during a normal rebuild.
  COMMAND ${CMAKE_COMMAND} -E make_directory "$<TARGET_FILE_DIR:groubot-cef-host>/locales"
)

foreach(CEF_RESOURCE chrome_100_percent.pak chrome_200_percent.pak resources.pak icudtl.dat)
  add_custom_command(TARGET groubot-cef-host POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E copy_if_different
      "${CEF_RESOURCE_DIR}/${CEF_RESOURCE}"
      "$<TARGET_FILE_DIR:groubot-cef-host>/${CEF_RESOURCE}")
endforeach()
add_custom_command(TARGET groubot-cef-host POST_BUILD
  COMMAND ${CMAKE_COMMAND} -E copy_directory
    "${CEF_RESOURCE_DIR}/locales"
    "$<TARGET_FILE_DIR:groubot-cef-host>/locales")

message(STATUS "CEF version: ${CEF_VERSION}")
message(STATUS "CEF Chromium version: ${CEF_CHROMIUM_VERSION}")
