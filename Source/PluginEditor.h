#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include "PluginProcessor.h"

class StreamMasterEditor : public juce::AudioProcessorEditor
{
public:
    explicit StreamMasterEditor (StreamMasterProcessor&);
    ~StreamMasterEditor() override;

    void paint (juce::Graphics&) override;
    void resized() override;

private:
    StreamMasterProcessor& processor;
    juce::Label titleLabel;
    juce::Label statusLabel;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (StreamMasterEditor)
};
