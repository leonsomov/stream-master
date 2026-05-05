#include "PluginProcessor.h"
#include "PluginEditor.h"

StreamMasterProcessor::StreamMasterProcessor()
    : AudioProcessor (BusesProperties()
                          .withInput  ("Input",  juce::AudioChannelSet::stereo(), true)
                          .withOutput ("Output", juce::AudioChannelSet::stereo(), true))
{
    streamId = generateRandomId();
    streamThread.startThread (juce::Thread::Priority::normal);
}

StreamMasterProcessor::~StreamMasterProcessor()
{
    streaming.store (false, std::memory_order_release);
    streamThread.stopThread (1000);
}

void StreamMasterProcessor::prepareToPlay (double sampleRate, int samplesPerBlock)
{
    runningSampleRate.store (sampleRate, std::memory_order_relaxed);

    const int capacitySamples = juce::jmax (48000, (int) (sampleRate * 2.0));
    fifoBuffer.setSize (2, capacitySamples, false, true, true);
    fifoBuffer.clear();
    audioFifo.setTotalSize (capacitySamples);
    audioFifo.reset();

    juce::ignoreUnused (samplesPerBlock);
}

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

    const auto totalIn  = getTotalNumInputChannels();
    const auto totalOut = getTotalNumOutputChannels();

    for (int i = totalIn; i < totalOut; ++i)
        buffer.clear (i, 0, buffer.getNumSamples());

    if (! streaming.load (std::memory_order_acquire))
        return;

    const auto numSamples  = buffer.getNumSamples();
    const auto numChannels = juce::jmin (2, buffer.getNumChannels());

    int start1, size1, start2, size2;
    audioFifo.prepareToWrite (numSamples, start1, size1, start2, size2);

    const int written = size1 + size2;
    const int dropped = numSamples - written;

    for (int ch = 0; ch < numChannels; ++ch)
    {
        if (size1 > 0)
            fifoBuffer.copyFrom (ch, start1, buffer, ch, 0, size1);
        if (size2 > 0)
            fifoBuffer.copyFrom (ch, start2, buffer, ch, size1, size2);
    }

    audioFifo.finishedWrite (written);

    if (written > 0)
        framesCaptured.fetch_add (written, std::memory_order_relaxed);
    if (dropped > 0)
        framesDropped.fetch_add (dropped, std::memory_order_relaxed);
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

void StreamMasterProcessor::setStreaming (bool shouldStream)
{
    if (shouldStream == streaming.load (std::memory_order_acquire))
        return;

    if (shouldStream)
    {
        framesCaptured.store (0, std::memory_order_relaxed);
        framesDropped.store  (0, std::memory_order_relaxed);
        audioFifo.reset();
        streaming.store (true, std::memory_order_release);
    }
    else
    {
        streaming.store (false, std::memory_order_release);
    }
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

void StreamMasterProcessor::StreamThread::run()
{
    while (! threadShouldExit())
    {
        const int avail = processor.audioFifo.getNumReady();
        if (avail > 0)
        {
            int start1, size1, start2, size2;
            processor.audioFifo.prepareToRead (avail, start1, size1, start2, size2);
            processor.audioFifo.finishedRead (size1 + size2);
        }
        wait (5);
    }
}

juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter()
{
    return new StreamMasterProcessor();
}
