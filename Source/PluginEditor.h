#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include "PluginProcessor.h"

class StreamMasterEditor : public juce::AudioProcessorEditor,
                           private juce::Timer
{
public:
    explicit StreamMasterEditor (StreamMasterProcessor&);
    ~StreamMasterEditor() override;

    void paint (juce::Graphics&) override;
    void resized() override;

private:
    void timerCallback() override;
    void copyLink();
    void regenerateId();
    void toggleStreaming();
    void refreshIdDisplay();
    void refreshStatus();

    StreamMasterProcessor& processor;

    juce::Label       titleLabel;
    juce::Label       idCaption;
    juce::Label       idDisplay;
    juce::TextButton  regenButton    { "New" };
    juce::TextButton  copyButton     { "Copy Link" };
    juce::TextButton  streamButton   { "Start Streaming" };
    juce::Label       statusLabel;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (StreamMasterEditor)
};
