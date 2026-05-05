#include "PluginEditor.h"

namespace colours
{
    static const juce::Colour background  { 0xff121212 };
    static const juce::Colour panel       { 0xff1c1c1c };
    static const juce::Colour textPrimary { 0xfff2f2f2 };
    static const juce::Colour textMuted   { 0xff8a8a8a };
    static const juce::Colour accent      { 0xff7cf2a8 };
    static const juce::Colour live        { 0xffe54848 };
}

StreamMasterEditor::StreamMasterEditor (StreamMasterProcessor& p)
    : AudioProcessorEditor (&p), processor (p)
{
    setSize (480, 240);

    titleLabel.setText ("Stream Master", juce::dontSendNotification);
    titleLabel.setFont (juce::FontOptions (22.0f, juce::Font::bold));
    titleLabel.setJustificationType (juce::Justification::centred);
    titleLabel.setColour (juce::Label::textColourId, colours::textPrimary);
    addAndMakeVisible (titleLabel);

    idCaption.setText ("STREAM ID", juce::dontSendNotification);
    idCaption.setFont (juce::FontOptions (10.0f, juce::Font::bold));
    idCaption.setColour (juce::Label::textColourId, colours::textMuted);
    idCaption.setJustificationType (juce::Justification::centredLeft);
    addAndMakeVisible (idCaption);

    idDisplay.setFont (juce::FontOptions (juce::Font::getDefaultMonospacedFontName(), 18.0f, juce::Font::plain));
    idDisplay.setColour (juce::Label::textColourId, colours::accent);
    idDisplay.setColour (juce::Label::backgroundColourId, colours::panel);
    idDisplay.setJustificationType (juce::Justification::centredLeft);
    idDisplay.setBorderSize ({ 4, 12, 4, 12 });
    addAndMakeVisible (idDisplay);

    regenButton.setTooltip ("Generate a new stream ID (invalidates the old link)");
    regenButton.setColour (juce::TextButton::buttonColourId, colours::panel);
    regenButton.setColour (juce::TextButton::textColourOffId, colours::textMuted);
    regenButton.onClick = [this] { regenerateId(); };
    addAndMakeVisible (regenButton);

    copyButton.setColour (juce::TextButton::buttonColourId, colours::accent);
    copyButton.setColour (juce::TextButton::buttonOnColourId, colours::accent);
    copyButton.setColour (juce::TextButton::textColourOffId, juce::Colours::black);
    copyButton.setColour (juce::TextButton::textColourOnId,  juce::Colours::black);
    copyButton.onClick = [this] { copyLink(); };
    addAndMakeVisible (copyButton);

    streamButton.onClick = [this] { toggleStreaming(); };
    addAndMakeVisible (streamButton);

    statusLabel.setFont (juce::FontOptions (12.0f));
    statusLabel.setColour (juce::Label::textColourId, colours::textMuted);
    statusLabel.setJustificationType (juce::Justification::centred);
    addAndMakeVisible (statusLabel);

    refreshIdDisplay();
    refreshStatus();
    startTimerHz (4);
}

StreamMasterEditor::~StreamMasterEditor() = default;

void StreamMasterEditor::paint (juce::Graphics& g)
{
    g.fillAll (colours::background);
}

void StreamMasterEditor::resized()
{
    auto area = getLocalBounds().reduced (20);

    titleLabel.setBounds (area.removeFromTop (32));
    area.removeFromTop (12);

    idCaption.setBounds (area.removeFromTop (16));
    area.removeFromTop (4);

    auto idRow = area.removeFromTop (36);
    regenButton.setBounds (idRow.removeFromRight (36));
    idRow.removeFromRight (8);
    idDisplay.setBounds (idRow);

    area.removeFromTop (16);
    auto buttonRow = area.removeFromTop (40);
    const int half = (buttonRow.getWidth() - 8) / 2;
    copyButton.setBounds   (buttonRow.removeFromLeft (half));
    buttonRow.removeFromLeft (8);
    streamButton.setBounds (buttonRow);

    area.removeFromTop (16);
    statusLabel.setBounds (area.removeFromTop (20));
}

void StreamMasterEditor::copyLink()
{
    juce::SystemClipboard::copyTextToClipboard (processor.getStreamUrl());
    copyButton.setButtonText ("Copied");

    juce::Component::SafePointer<StreamMasterEditor> safe (this);
    juce::Timer::callAfterDelay (1500, [safe]
    {
        if (safe != nullptr)
            safe->copyButton.setButtonText ("Copy Link");
    });
}

void StreamMasterEditor::regenerateId()
{
    processor.regenerateStreamId();
    refreshIdDisplay();
}

void StreamMasterEditor::toggleStreaming()
{
    processor.setStreaming (! processor.isStreaming());
    refreshStatus();
}

void StreamMasterEditor::refreshIdDisplay()
{
    idDisplay.setText (processor.getStreamId(), juce::dontSendNotification);
}

void StreamMasterEditor::refreshStatus()
{
    const bool live = processor.isStreaming();

    if (live)
    {
        streamButton.setButtonText ("Stop Streaming");
        streamButton.setColour (juce::TextButton::buttonColourId,    colours::live);
        streamButton.setColour (juce::TextButton::buttonOnColourId,  colours::live);
        streamButton.setColour (juce::TextButton::textColourOffId,   juce::Colours::white);
        streamButton.setColour (juce::TextButton::textColourOnId,    juce::Colours::white);
    }
    else
    {
        streamButton.setButtonText ("Start Streaming");
        streamButton.setColour (juce::TextButton::buttonColourId,    colours::panel);
        streamButton.setColour (juce::TextButton::buttonOnColourId,  colours::panel);
        streamButton.setColour (juce::TextButton::textColourOffId,   colours::textPrimary);
        streamButton.setColour (juce::TextButton::textColourOnId,    colours::textPrimary);
    }

    const auto frames = processor.getFramesCaptured();
    const auto rate   = processor.getRunningSampleRate();
    const auto totalSeconds = (rate > 0.0) ? (double) frames / rate : 0.0;
    const int  mins = (int) (totalSeconds / 60.0);
    const int  secs = (int) totalSeconds % 60;

    const auto stateText = live ? juce::String ("Live") : juce::String ("Idle");
    const auto timeText  = juce::String::formatted ("%d:%02d captured", mins, secs);
    auto detail = stateText + "  /  " + timeText;

    const auto dropped = processor.getFramesDropped();
    if (dropped > 0)
        detail += juce::String::formatted ("  /  %lld dropped", (long long) dropped);

    statusLabel.setText (detail, juce::dontSendNotification);
}

void StreamMasterEditor::timerCallback()
{
    refreshStatus();
}
