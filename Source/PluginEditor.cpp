#include "PluginEditor.h"

GPStreamEditor::GPStreamEditor (GPStreamProcessor& p)
    : AudioProcessorEditor (&p), processor (p)
{
    setSize (380, 180);

    titleLabel.setText ("GP Stream", juce::dontSendNotification);
    titleLabel.setFont (juce::FontOptions (24.0f, juce::Font::bold));
    titleLabel.setJustificationType (juce::Justification::centred);
    titleLabel.setColour (juce::Label::textColourId, juce::Colours::white);
    addAndMakeVisible (titleLabel);

    statusLabel.setText ("v0 — passthrough only\nnetworking lands next",
                         juce::dontSendNotification);
    statusLabel.setFont (juce::FontOptions (13.0f));
    statusLabel.setJustificationType (juce::Justification::centred);
    statusLabel.setColour (juce::Label::textColourId, juce::Colours::lightgrey);
    addAndMakeVisible (statusLabel);
}

GPStreamEditor::~GPStreamEditor() = default;

void GPStreamEditor::paint (juce::Graphics& g)
{
    g.fillAll (juce::Colour (0xff121212));
}

void GPStreamEditor::resized()
{
    auto area = getLocalBounds().reduced (16);
    titleLabel.setBounds (area.removeFromTop (40));
    statusLabel.setBounds (area);
}
