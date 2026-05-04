#include "PluginProcessor.h"
#include "PluginEditor.h"

StreamMasterProcessor::StreamMasterProcessor()
    : AudioProcessor (BusesProperties()
                          .withInput  ("Input",  juce::AudioChannelSet::stereo(), true)
                          .withOutput ("Output", juce::AudioChannelSet::stereo(), true))
{
    streamId = generateRandomId();
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

void StreamMasterProcessor::getStateInformation (juce::MemoryBlock& destData)
{
    juce::ValueTree state ("StreamMaster");
    state.setProperty ("streamId", streamId, nullptr);
    juce::MemoryOutputStream stream (destData, false);
    state.writeToStream (stream);
}

void StreamMasterProcessor::setStateInformation (const void* data, int sizeInBytes)
{
    auto state = juce::ValueTree::readFromData (data, (size_t) sizeInBytes);
    if (! state.isValid())
        return;

    auto loadedId = state.getProperty ("streamId").toString();
    if (loadedId.isNotEmpty())
        streamId = loadedId;
}

void StreamMasterProcessor::regenerateStreamId()
{
    streamId = generateRandomId();
}

juce::String StreamMasterProcessor::getStreamUrl() const
{
    return juce::String (receiverUrlBase) + streamId;
}

juce::String StreamMasterProcessor::generateRandomId()
{
    static const char alphabet[] = "abcdefghijkmnpqrstuvwxyz23456789";
    static constexpr int alphabetSize = (int) sizeof (alphabet) - 1;

    juce::Random rng;
    rng.setSeedRandomly();

    juce::String id;
    for (int i = 0; i < 9; ++i)
    {
        if (i == 4)
            id << '-';
        else
            id << alphabet[rng.nextInt (alphabetSize)];
    }
    return id;
}

juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter()
{
    return new StreamMasterProcessor();
}
