#pragma once

#include <atomic>
#include <juce_audio_processors/juce_audio_processors.h>

class StreamMasterProcessor : public juce::AudioProcessor
{
public:
    StreamMasterProcessor();
    ~StreamMasterProcessor() override;

    void prepareToPlay (double sampleRate, int samplesPerBlock) override;
    void releaseResources() override;
    bool isBusesLayoutSupported (const BusesLayout& layouts) const override;
    void processBlock (juce::AudioBuffer<float>&, juce::MidiBuffer&) override;

    juce::AudioProcessorEditor* createEditor() override;
    bool hasEditor() const override { return true; }

    const juce::String getName() const override { return "Stream Master"; }
    bool acceptsMidi()  const override { return false; }
    bool producesMidi() const override { return false; }
    bool isMidiEffect() const override { return false; }
    double getTailLengthSeconds() const override { return 0.0; }

    int getNumPrograms() override                              { return 1; }
    int getCurrentProgram() override                           { return 0; }
    void setCurrentProgram (int) override                      {}
    const juce::String getProgramName (int) override           { return {}; }
    void changeProgramName (int, const juce::String&) override {}

    void getStateInformation (juce::MemoryBlock& destData) override;
    void setStateInformation (const void* data, int sizeInBytes) override;

    juce::String getStreamId() const   { return streamId; }
    void regenerateStreamId();
    juce::String getStreamUrl() const;

    void setStreaming (bool shouldStream);
    bool isStreaming() const { return streaming.load (std::memory_order_acquire); }

    int64_t getFramesCaptured() const { return framesCaptured.load (std::memory_order_relaxed); }
    int64_t getFramesDropped()  const { return framesDropped.load  (std::memory_order_relaxed); }
    double  getRunningSampleRate() const { return runningSampleRate.load (std::memory_order_relaxed); }

    static constexpr const char* receiverUrlBase = "https://leonsomov.github.io/stream-master/?r=";

private:
    class StreamThread : public juce::Thread
    {
    public:
        explicit StreamThread (StreamMasterProcessor& p)
            : juce::Thread ("Stream Master Net"), processor (p) {}

        void run() override;

    private:
        StreamMasterProcessor& processor;
    };

    static juce::String generateRandomId();

    juce::String streamId;

    std::atomic<bool>    streaming         { false };
    std::atomic<int64_t> framesCaptured    { 0 };
    std::atomic<int64_t> framesDropped     { 0 };
    std::atomic<double>  runningSampleRate { 48000.0 };

    juce::AbstractFifo       audioFifo  { 1 };
    juce::AudioBuffer<float> fifoBuffer;

    StreamThread streamThread { *this };

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (StreamMasterProcessor)
};
