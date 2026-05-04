#include "PluginProcessor.h"
#include "PluginEditor.h"

StreamMasterProcessor::StreamMasterProcessor()
    : AudioProcessor (BusesProperties()
                          .withInput  ("Input",  juce::AudioChannelSet::stereo(), true)
                          .withOutput ("Output", juce::AudioChannelSet::stereo(), true))
{
}

StreamMasterProcessor::~StreamMasterProcessor() = default;

void StreamMasterProcessor::prepareToPlay (double, int) {}
void StreamMasterProcessor::releaseResources() {}

bool StreamMasterProcessor::isBusesLayoutSupported (const BusesLayout& layouts) const
{
    const auto& mainOut = layouts.getMainOutputChannelSet();
    const auto& mainIn  = layouts.getMainInputChannelSet();

    if (mainOut != juce::AudioChannelSet::stereo()) return false;
    if (mainIn  != mainOut)                         return false;
    return true;
}

void StreamMasterProcessor::processBlock (juce::AudioBuffer<float>& buffer, juce::MidiBuffer&)
{
    juce::ScopedNoDenormals noDenormals;

    const auto totalNumInputChannels  = getTotalNumInputChannels();
    const auto totalNumOutputChannels = getTotalNumOutputChannels();

    for (int i = totalNumInputChannels; i < totalNumOutputChannels; ++i)
        buffer.clear (i, 0, buffer.getNumSamples());
}

juce::AudioProcessorEditor* StreamMasterProcessor::createEditor()
{
    return new StreamMasterEditor (*this);
}

void StreamMasterProcessor::getStateInformation (juce::MemoryBlock&) {}
void StreamMasterProcessor::setStateInformation (const void*, int)   {}

juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter()
{
    return new StreamMasterProcessor();
}
