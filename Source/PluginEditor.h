#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include "PluginProcessor.h"

class GPStreamEditor : public juce::AudioProcessorEditor
{
public:
    explicit GPStreamEditor (GPStreamProcessor&);
    ~GPStreamEditor() override;

    void paint (juce::Graphics&) override;
    void resized() override;

private:
    GPStreamProcessor& processor;
    juce::Label titleLabel;
    juce::Label statusLabel;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (GPStreamEditor)
};
