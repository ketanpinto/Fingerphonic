import React, { useEffect, useRef, useState } from 'react';
import { Hands } from '@mediapipe/hands';
import { Camera } from '@mediapipe/camera_utils';
import * as Tone from 'tone';
import './App.css';

const App = () => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [handsReady, setHandsReady] = useState(false);
  const [audioReady, setAudioReady] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [audioError, setAudioError] = useState(null);
  const [needsUserInteraction, setNeedsUserInteraction] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedChunks, setRecordedChunks] = useState([]);
  const [recordings, setRecordings] = useState([]);
  const [audioLevel, setAudioLevel] = useState(0);
  const [fingerStates, setFingerStates] = useState({
    thumb: 0,
    index: 0,
    middle: 0,
    ring: 0,
    pinky: 0
  });
  
  // Audio components refs
  const micRef = useRef(null);
  const reverbRef = useRef(null);
  const delayRef = useRef(null);
  const distortionRef = useRef(null);
  const chorusRef = useRef(null);
  const filterRef = useRef(null);
  const recorderRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordedBlobRef = useRef(null);
  const meterRef = useRef(null);
  const audioLevelIntervalRef = useRef(null);

  useEffect(() => {
    initializeMediaPipe();
    return () => {
      if (audioLevelIntervalRef.current) {
        clearInterval(audioLevelIntervalRef.current);
      }
    };
  }, []);

  const startAudioSystem = async () => {
    try {
      // Resume the audio context if it exists
      if (Tone.context.state === 'suspended') {
        await Tone.context.resume();
      }
      
      await initializeAudio();
      setNeedsUserInteraction(false);
      
      // Play a silent buffer to warm up the audio system
      const buffer = Tone.context.createBuffer(1, 1, 22050);
      const source = Tone.context.createBufferSource();
      source.buffer = buffer;
      source.connect(Tone.context.destination);
      source.start(0);
      
    } catch (error) {
      console.error('Failed to start audio system:', error);
      setAudioError(error.message);
    }
  };

  const initializeMediaPipe = async () => {
    try {
      const hands = new Hands({
        locateFile: (file) => {
          return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
        }
      });

      hands.setOptions({
        maxNumHands: 1,
        modelComplexity: 1,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
      });

      hands.onResults(onResults);

      if (videoRef.current) {
        const camera = new Camera(videoRef.current, {
          onFrame: async () => {
            try {
              await hands.send({ image: videoRef.current });
            } catch (error) {
              console.error('Error processing frame:', error);
            }
          },
          width: 640,
          height: 480
        });
        
        await camera.start();
        setHandsReady(true);
        setCameraError(null);
      }
    } catch (error) {
      console.error('Error initializing MediaPipe:', error);
      setCameraError(error.message);
      setHandsReady(false);
    }
  };

  const initializeAudio = async () => {
    try {
      // Start audio context
      await Tone.start();
      
      // Create microphone input
      micRef.current = new Tone.UserMedia();
      await micRef.current.open();
      
      // Create effects chain
      reverbRef.current = new Tone.Reverb({
        decay: 1.5,
        wet: 0
      }).toDestination(); // Connect reverb to main output
      
      delayRef.current = new Tone.FeedbackDelay({
        delayTime: "8n",
        feedback: 0,
        wet: 0
      });
      
      distortionRef.current = new Tone.Distortion({
        distortion: 0,
        wet: 0
      });
      
      chorusRef.current = new Tone.Chorus({
        frequency: 4,
        delayTime: 2.5,
        depth: 0,
        wet: 0
      }).start();
      
      filterRef.current = new Tone.Filter({
        frequency: 2000,
        type: 'lowpass',
        Q: 1
      });
      
      // Create recorder for capturing processed audio
      recorderRef.current = new Tone.Recorder();
      
      // Create meter for audio level monitoring
      meterRef.current = new Tone.Meter();
      
      // Connect audio chain for LIVE PLAYBACK
      micRef.current
        .connect(distortionRef.current)
        .connect(chorusRef.current)
        .connect(delayRef.current)
        .connect(filterRef.current)
        .connect(reverbRef.current);
      
      // ALSO connect to recorder for recording (parallel connection)
      reverbRef.current.connect(recorderRef.current);
      
      // Connect to meter for level monitoring
      reverbRef.current.connect(meterRef.current);
      
      // Start audio level monitoring
      audioLevelIntervalRef.current = setInterval(() => {
        if (meterRef.current) {
          const level = meterRef.current.getValue();
          setAudioLevel(Array.isArray(level) ? Math.max(...level) : level);
        }
      }, 100);
      
      setAudioReady(true);
      setAudioError(null);
    } catch (error) {
      console.error('Error initializing audio:', error);
      setAudioError(error.message);
      setAudioReady(false);
      throw error;
    }
  };

  const calculateFingerExtension = (landmarks, fingerTipIndex, fingerMcpIndex) => {
    if (!landmarks || landmarks.length <= fingerTipIndex || landmarks.length <= fingerMcpIndex) {
      return 0;
    }
    
    const tip = landmarks[fingerTipIndex];
    const mcp = landmarks[fingerMcpIndex];
    
    // Calculate distance - more distance means more extended
    const distance = Math.sqrt(
      Math.pow(tip.x - mcp.x, 2) + 
      Math.pow(tip.y - mcp.y, 2) + 
      Math.pow(tip.z - mcp.z, 2)
    );
    
    // Normalize to 0-1 range (approximate)
    return Math.min(Math.max(distance * 5, 0), 1);
  };

  const onResults = (results) => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw video frame
    ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
    
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      const landmarks = results.multiHandLandmarks[0];
      
      // Calculate finger extensions
      const newFingerStates = {
        thumb: calculateFingerExtension(landmarks, 4, 2),
        index: calculateFingerExtension(landmarks, 8, 5),
        middle: calculateFingerExtension(landmarks, 12, 9),
        ring: calculateFingerExtension(landmarks, 16, 13),
        pinky: calculateFingerExtension(landmarks, 20, 17)
      };
      
      setFingerStates(newFingerStates);
      updateAudioFilters(newFingerStates);
      
      // Draw hand landmarks
      drawLandmarks(ctx, landmarks);
    }
  };

  const drawLandmarks = (ctx, landmarks) => {
    ctx.fillStyle = '#FF0000';
    landmarks.forEach((landmark) => {
      ctx.beginPath();
      ctx.arc(
        landmark.x * canvasRef.current.width,
        landmark.y * canvasRef.current.height,
        3,
        0,
        2 * Math.PI
      );
      ctx.fill();
    });
  };

  const updateAudioFilters = (states) => {
    if (!audioReady) return;
    
    try {
      // Thumb controls reverb
      if (reverbRef.current) {
        reverbRef.current.wet.value = states.thumb;
      }
      
      // Index controls delay
      if (delayRef.current) {
        delayRef.current.wet.value = states.index;
        delayRef.current.feedback.value = states.index * 0.7;
      }
      
      // Middle controls distortion
      if (distortionRef.current) {
        distortionRef.current.distortion = states.middle * 0.8;
        distortionRef.current.wet.value = states.middle;
      }
      
      // Ring controls chorus
      if (chorusRef.current) {
        chorusRef.current.depth = states.ring;
        chorusRef.current.wet.value = states.ring;
      }
      
      // Pinky controls filter
      if (filterRef.current) {
        const minFreq = 200;
        const maxFreq = 8000;
        filterRef.current.frequency.value = minFreq + (states.pinky * (maxFreq - minFreq));
      }
    } catch (error) {
      console.error('Error updating audio filters:', error);
    }
  };

  const getFingerBarColor = (value) => {
    const intensity = Math.round(value * 255);
    return `rgb(${255 - intensity}, ${intensity}, 100)`;
  };

  const startRecording = async () => {
    if (!handsReady || !audioReady) {
      alert('Please make sure camera and audio are ready before recording!');
      return;
    }

    try {
      console.log('Starting recording...');
      
      // Start Tone.js recorder for audio
      await recorderRef.current.start();
      console.log('Audio recorder started');
      
      // Get canvas stream for video
      const canvasStream = canvasRef.current.captureStream(30); // 30 FPS
      console.log('Canvas stream created');
      
      // Create MediaRecorder for video
      const options = { mimeType: 'video/webm' };
      
      if (!MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
        if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8')) {
          options.mimeType = 'video/webm;codecs=vp8';
        } else if (MediaRecorder.isTypeSupported('video/webm')) {
          options.mimeType = 'video/webm';
        } else {
          console.warn('WebM not supported, using default');
          delete options.mimeType;
        }
      }
      
      mediaRecorderRef.current = new MediaRecorder(canvasStream, options);
      console.log('MediaRecorder created with options:', options);
      
      const chunks = [];
      
      mediaRecorderRef.current.ondataavailable = (event) => {
        console.log('Video data available:', event.data.size, 'bytes');
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };
      
      mediaRecorderRef.current.onstop = async () => {
        console.log('MediaRecorder stopped, processing...');
        
        try {
          // Stop Tone.js recorder and get audio
          console.log('Stopping audio recorder...');
          const audioBuffer = await recorderRef.current.stop();
          console.log('Audio buffer received:', audioBuffer);
          
          // Convert audio buffer to blob
          console.log('Converting audio buffer to blob...');
          const audioBlob = await audioBufferToBlob(audioBuffer);
          console.log('Audio blob created:', audioBlob.size, 'bytes');
          
          // Create video blob
          const videoBlob = new Blob(chunks, { type: options.mimeType || 'video/webm' });
          console.log('Video blob created:', videoBlob.size, 'bytes');
          
          // Create recording entry
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const newRecording = {
            id: Date.now(),
            timestamp,
            videoBlob,
            audioBlob,
            name: `recording-${timestamp.slice(0, 19)}`
          };
          
          setRecordings(prev => [...prev, newRecording]);
          console.log('Recording saved successfully');
          
          // Clear chunks
          chunks.length = 0;
          
        } catch (error) {
          console.error('Error processing recording:', error);
          alert('Error processing recording: ' + error.message);
        }
      };
      
      mediaRecorderRef.current.onerror = (event) => {
        console.error('MediaRecorder error:', event.error);
        alert('Recording error: ' + event.error.message);
        setIsRecording(false);
      };
      
      mediaRecorderRef.current.start(1000); // Collect data every second
      setIsRecording(true);
      console.log('Recording started successfully');
      
    } catch (error) {
      console.error('Error starting recording:', error);
      alert('Failed to start recording: ' + error.message);
      setIsRecording(false);
    }
  };

  const stopRecording = async () => {
    console.log('Stop recording requested');
    
    if (mediaRecorderRef.current && isRecording) {
      try {
        console.log('Stopping MediaRecorder...');
        mediaRecorderRef.current.stop();
        
        // Add a small delay to ensure recorder has stopped
        await new Promise(resolve => setTimeout(resolve, 500));
        
        console.log('Getting audio buffer...');
        const audioBuffer = await recorderRef.current.stop();
        
        if (!audioBuffer || audioBuffer.length === 0) {
          throw new Error('Empty audio buffer received');
        }
        
        console.log('Audio buffer received:', audioBuffer);
        const audioBlob = await audioBufferToBlob(audioBuffer);
        
        setIsRecording(false);
        console.log('Recording stopped successfully');
      } catch (error) {
        console.error('Error stopping recording:', error);
        alert('Error processing recording: ' + error.message);
        setIsRecording(false);
      }
    }
  };
  
  const audioBufferToBlob = async (audioBuffer) => {
    try {
      if (!audioBuffer || 
        (typeof audioBuffer.numberOfChannels === 'undefined') || 
        (typeof audioBuffer.length === 'undefined')) {
      throw new Error('Invalid audio buffer received');
    }
    const buffer = audioBuffer.get ? audioBuffer.get() : audioBuffer;
    
    // Additional validation
    if (!buffer || buffer.length === 0 || buffer.numberOfChannels === 0) {
      throw new Error('Empty audio data in buffer');
    }
      
      const numberOfChannels = buffer.numberOfChannels || 1;
      const length = buffer.length;
      const sampleRate = buffer.sampleRate || 44100;
      
      console.log('Audio buffer info:', { numberOfChannels, length, sampleRate });
      
      // Create a WAV file
      const bytesPerSample = 2; // 16-bit
      const blockAlign = numberOfChannels * bytesPerSample;
      const byteRate = sampleRate * blockAlign;
      const dataSize = length * blockAlign;
      const fileSize = 36 + dataSize;
      
      const arrayBuffer = new ArrayBuffer(44 + dataSize);
      const view = new DataView(arrayBuffer);
      
      // WAV header
      const writeString = (offset, string) => {
        for (let i = 0; i < string.length; i++) {
          view.setUint8(offset + i, string.charCodeAt(i));
        }
      };
      
      // RIFF chunk
      writeString(0, 'RIFF');
      view.setUint32(4, fileSize, true);
      writeString(8, 'WAVE');
      
      // fmt chunk
      writeString(12, 'fmt ');
      view.setUint32(16, 16, true); // chunk size
      view.setUint16(20, 1, true); // audio format (PCM)
      view.setUint16(22, numberOfChannels, true);
      view.setUint32(24, sampleRate, true);
      view.setUint32(28, byteRate, true);
      view.setUint16(32, blockAlign, true);
      view.setUint16(34, 16, true); // bits per sample
      
      // data chunk
      writeString(36, 'data');
      view.setUint32(40, dataSize, true);
      
      // Write audio data
      let offset = 44;
      
      // Handle different buffer formats
      if (buffer.getChannelData) {
        // Standard AudioBuffer
        for (let i = 0; i < length; i++) {
          for (let channel = 0; channel < numberOfChannels; channel++) {
            const channelData = buffer.getChannelData(channel);
            const sample = Math.max(-1, Math.min(1, channelData[i]));
            const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
            view.setInt16(offset, intSample, true);
            offset += 2;
          }
        }
      } else if (buffer._buffer && buffer._buffer.getChannelData) {
        // Tone.js buffer wrapper
        const toneBuffer = buffer._buffer;
        for (let i = 0; i < length; i++) {
          for (let channel = 0; channel < numberOfChannels; channel++) {
            const channelData = toneBuffer.getChannelData(channel);
            const sample = Math.max(-1, Math.min(1, channelData[i]));
            const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
            view.setInt16(offset, intSample, true);
            offset += 2;
          }
        }
      } else {
        throw new Error('Unsupported audio buffer format');
      }
      
      return new Blob([arrayBuffer], { type: 'audio/wav' });
    } catch (error) {
      console.error('Audio conversion error:', error);
      throw new Error('Failed to process audio: ' + error.message);
    }
  };

  const downloadRecording = (recording, type) => {
    const blob = type === 'video' ? recording.videoBlob : recording.audioBlob;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${recording.name}-${type}.${type === 'video' ? 'webm' : 'wav'}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const deleteRecording = (id) => {
    setRecordings(prev => prev.filter(rec => rec.id !== id));
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-4xl font-bold text-center mb-8 bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
          Finger-Controlled Audio Filters
        </h1>
        
        <div className="grid md:grid-cols-2 gap-8">
          {/* Video Feed */}
          <div className="relative">
            <div className="bg-gray-800 rounded-lg p-4">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold">Hand Tracking</h2>
                {/* Recording Controls */}
                <div className="flex space-x-2">
                  {!isRecording ? (
                    <button 
                      onClick={startRecording}
                      disabled={!handsReady || !audioReady}
                      className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
                        handsReady && audioReady 
                          ? 'bg-red-600 hover:bg-red-700 text-white' 
                          : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                      }`}
                    >
                      🔴 Record
                    </button>
                  ) : (
                    <button 
                      onClick={stopRecording}
                      className="bg-gray-600 hover:bg-gray-700 px-4 py-2 rounded-lg font-semibold transition-colors animate-pulse"
                    >
                      ⏹️ Stop Recording
                    </button>
                  )}
                </div>
              </div>
              <div className="relative">
                <video 
                  ref={videoRef} 
                  className="hidden"
                  width="640" 
                  height="480"
                  autoPlay 
                  playsInline
                />
                <canvas 
                  ref={canvasRef} 
                  width="640" 
                  height="480"
                  className="w-full max-w-lg mx-auto border border-gray-600 rounded"
                />
              </div>
              <div className="mt-4 flex justify-center space-x-4">
                <div className={`px-3 py-1 rounded text-sm ${handsReady ? 'bg-green-600' : (cameraError ? 'bg-red-600' : 'bg-yellow-600')}`}>
                  Camera: {handsReady ? 'Ready' : (cameraError ? 'Error' : 'Starting...')}
                </div>
                <div className={`px-3 py-1 rounded text-sm ${audioReady ? 'bg-green-600' : (audioError ? 'bg-red-600' : 'bg-yellow-600')}`}>
                  Audio: {audioReady ? 'Ready' : (audioError ? 'Error' : 'Not Started')}
                </div>
              </div>
              
              {/* Audio Level Indicator */}
              {audioReady && (
                <div className="mt-3 flex items-center justify-center space-x-2">
                  <span className="text-sm text-gray-400">Audio Level:</span>
                  <div className="flex-1 max-w-xs bg-gray-700 rounded-full h-2 relative overflow-hidden">
                    <div 
                      className="h-full transition-all duration-100 rounded-full bg-gradient-to-r from-green-500 via-yellow-500 to-red-500"
                      style={{ 
                        width: `${Math.min(Math.max((audioLevel + 60) / 60 * 100, 0), 100)}%`
                      }}
                    />
                  </div>
                  <span className="text-xs text-gray-400 w-12">
                    {Math.round(audioLevel)}dB
                  </span>
                </div>
              )}
              
              {/* Error Messages */}
              {cameraError && (
                <div className="mt-2 p-2 bg-red-900 border border-red-600 rounded text-sm">
                  Camera Error: {cameraError}
                </div>
              )}
              {audioError && (
                <div className="mt-2 p-2 bg-red-900 border border-red-600 rounded text-sm">
                  Audio Error: {audioError}
                </div>
              )}
              
              {/* Start Audio Button */}
              {needsUserInteraction && (
                <div className="mt-4 flex justify-center">
                <button 
                onClick={async () => {
                  await startAudioSystem();
                  // Additional code if needed
                }}
                className="bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded-lg font-semibold transition-colors"
              >
                🎵 Start Audio System
              </button>
                </div>
              )}
            </div>
          </div>
          
          {/* Finger Controls */}
          <div className="bg-gray-800 rounded-lg p-4">
            <h2 className="text-xl font-semibold mb-4">Finger Controls</h2>
            <p className="text-gray-400 mb-6 text-sm">
              Extend your fingers to control audio filters. Make sure your microphone is enabled!
            </p>
            
            <div className="space-y-4">
              {Object.entries(fingerStates).map(([finger, value]) => {
                const effects = {
                  thumb: 'Reverb',
                  index: 'Delay',
                  middle: 'Distortion',
                  ring: 'Chorus',
                  pinky: 'Filter'
                };
                
                return (
                  <div key={finger} className="flex items-center space-x-4">
                    <div className="w-16 text-sm font-medium capitalize">
                      {finger}
                    </div>
                    <div className="w-20 text-sm text-gray-400">
                      {effects[finger]}
                    </div>
                    <div className="flex-1 bg-gray-700 rounded-full h-4 relative overflow-hidden">
                      <div 
                        className="h-full transition-all duration-100 rounded-full"
                        style={{ 
                          width: `${value * 100}%`,
                          backgroundColor: getFingerBarColor(value)
                        }}
                      />
                    </div>
                    <div className="w-12 text-sm text-right">
                      {Math.round(value * 100)}%
                    </div>
                  </div>
                );
              })}
            </div>
            
            <div className="mt-8 p-4 bg-gray-700 rounded-lg">
              <h3 className="font-semibold mb-2">Instructions:</h3>
              <ul className="text-sm space-y-1 text-gray-300">
                <li>• Allow camera and microphone permissions</li>
                <li>• Click "Start Audio System" to enable audio processing</li>
                <li>• Show your hand to the camera</li>
                <li>• Sing or speak into your microphone</li>
                <li>• Extend fingers to apply effects</li>
                <li>• Each finger controls a different filter</li>
              </ul>
              
              {(!handsReady || !audioReady) && (
                <div className="mt-4 p-3 bg-yellow-900 border border-yellow-600 rounded text-sm">
                  <strong>⚠️ Setup Required:</strong>
                  <br />
                  {!handsReady && "• Camera access needed for hand tracking"}
                  <br />
                  {!audioReady && "• Audio system needs to be started"}
                </div>
              )}
            </div>
          </div>
        </div>
        
        {/* Recordings Section */}
        {recordings.length > 0 && (
          <div className="mt-8 bg-gray-800 rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">📹 Your Recordings</h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {recordings.map((recording) => (
                <div key={recording.id} className="bg-gray-700 rounded-lg p-4">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h3 className="font-semibold text-sm truncate">{recording.name}</h3>
                      <p className="text-xs text-gray-400">{new Date(recording.timestamp.replace(/-/g, ':')).toLocaleString()}</p>
                    </div>
                    <button 
                      onClick={() => deleteRecording(recording.id)}
                      className="text-red-400 hover:text-red-300 text-sm"
                      title="Delete recording"
                    >
                      🗑️
                    </button>
                  </div>
                  
                  {/* Video Preview */}
                  <div className="mb-3">
                    <video 
                      src={URL.createObjectURL(recording.videoBlob)}
                      className="w-full h-24 object-cover rounded bg-gray-600"
                      controls
                      muted
                    />
                  </div>
                  
                  {/* Download Buttons */}
                  <div className="flex space-x-2">
                    <button 
                      onClick={() => downloadRecording(recording, 'video')}
                      className="flex-1 bg-blue-600 hover:bg-blue-700 px-3 py-2 rounded text-sm font-medium transition-colors"
                    >
                      📹 Video
                    </button>
                    <button 
                      onClick={() => downloadRecording(recording, 'audio')}
                      className="flex-1 bg-green-600 hover:bg-green-700 px-3 py-2 rounded text-sm font-medium transition-colors"
                    >
                      🎵 Audio
                    </button>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="mt-4 p-3 bg-gray-700 rounded text-sm text-gray-300">
              <strong>💡 Recording Info:</strong>
              <br />
              • Video files capture your hand tracking with visual effects
              <br />
              • Audio files contain your voice with all finger-controlled effects applied
              <br />
              • Files are saved separately - video as .webm, audio as .wav
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;