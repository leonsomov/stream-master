cmake_minimum_required(VERSION 3.22)
project(StreamMaster VERSION 0.1.0 LANGUAGES C CXX)

set(CMAKE_OSX_ARCHITECTURES "arm64" CACHE STRING "" FORCE)
set(CMAKE_OSX_DEPLOYMENT_TARGET "11.0" CACHE STRING "" FORCE)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

add_subdirectory(JUCE)

juce_add_plugin(StreamMaster
    COMPANY_NAME              "Geeky Punks"
    BUNDLE_ID                 "com.geekypunks.streammaster"
    PLUGIN_MANUFACTURER_CODE  Gpks
    PLUGIN_CODE               Strm
    FORMATS                   AU VST3 Standalone
    PRODUCT_NAME              "Stream Master"
    IS_SYNTH                  FALSE
    NEEDS_MIDI_INPUT          FALSE
    NEEDS_MIDI_OUTPUT         FALSE
    IS_MIDI_EFFECT            FALSE
    EDITOR_WANTS_KEYBOARD_FOCUS FALSE
    COPY_PLUGIN_AFTER_BUILD   TRUE
    VST3_CATEGORIES           Fx Network
    AU_MAIN_TYPE              kAudioUnitType_Effect
)

target_sources(StreamMaster
    PRIVATE
        Source/PluginProcessor.cpp
        Source/PluginEditor.cpp
)

target_compile_definitions(StreamMaster
    PUBLIC
        JUCE_WEB_BROWSER=0
        JUCE_USE_CURL=0
        JUCE_VST3_CAN_REPLACE_VST2=0
        JUCE_DISPLAY_SPLASH_SCREEN=0
)

target_link_libraries(StreamMaster
    PRIVATE
        juce::juce_audio_utils
    PUBLIC
        juce::juce_recommended_config_flags
        juce::juce_recommended_lto_flags
        juce::juce_recommended_warning_flags
)
