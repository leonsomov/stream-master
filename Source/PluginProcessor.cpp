#include "PluginProcessor.h"
#include "PluginEditor.h"

GPStreamProcessor::GPStreamProcessor()
    : AudioProcessor (BusesProperties()
                          .withInput  ("Input",  juce::AudioChannelSet::stereo(), true)
                          .withOutput ("Output", juce::AudioChannelSet::stereo(), true))
{
}

GPStreamProcessor::~GPStreamProcessor() = default;

void GPStreamProcessor::prepareToPlay (double, int) {}
void GPStreamProcessor::releaseResources() {}

bool GPStreamProcessor::isBusesLayoutSupported (const BusesLayout& layouts) const
{
    const auto& mainOut = layouts.getMainOutputChannelSet();
    const auto& mainIn  = layouts.getMainInputChannelSet();

    if (mainOut != juce::AudioChannelSet::stereo()) return false;
    if (mainIn  != mainOut)                         return false;
    return true;
}

void GPStreamProcessor::processBlock (juce::AudioBuffer<float>& buffer, juce::MidiBuffer&)
{
    juce::ScopedNoDenormals noDenormals;

    const auto totalNumInputChannels  = getTotalNumInputChannels();
    const auto totalNumOutputChannels = getTotalNumOutputChannels();

    for (int i = totalNumInputChannels; i < totalNumOutputChannels; ++i)
        buffer.clear (i, 0, buffer.getNumSamples());
}

juce::AudioProcessorEditor* GPStreamProcessor::createEditor()
{
    return new GPStreamEditor (*this);
}

void GPStreamProcessor::getStateInformation (juce::MemoryBlock&) {}
void GPStreamProcessor::setStateInformation (const void*, int)   {}

juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter()
{
    return new GPStreamProcessor();
}
