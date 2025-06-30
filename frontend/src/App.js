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

  useEffect(() => {
    initializeMediaPipe();
  }, []);

  const startAudioSystem = async () => {
    try {
      await initializeAudio();
      setNeedsUserInteraction(false);
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
      });
      
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
      
      // Connect audio chain (including recorder for capturing processed audio)
      micRef.current
        .connect(distortionRef.current)
        .connect(chorusRef.current)
        .connect(delayRef.current)
        .connect(filterRef.current)
        .connect(reverbRef.current)
        .connect(recorderRef.current); // Connect to recorder as well
      
      // Also connect to destination for live audio
      reverbRef.current.toDestination();
      
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
      // Start Tone.js recorder for audio
      await recorderRef.current.start();
      
      // Get canvas stream for video
      const canvasStream = canvasRef.current.captureStream(30); // 30 FPS
      
      // Create MediaRecorder for video
      mediaRecorderRef.current = new MediaRecorder(canvasStream, {
        mimeType: 'video/webm;codecs=vp9'
      });
      
      const chunks = [];
      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };
      
      mediaRecorderRef.current.onstop = async () => {
        // Stop Tone.js recorder and get audio
        const audioBuffer = await recorderRef.current.stop();
        
        // Convert audio buffer to blob
        const audioBlob = await audioBufferToBlob(audioBuffer);
        
        // Create video blob
        const videoBlob = new Blob(chunks, { type: 'video/webm' });
        
        // For now, we'll save them separately
        // TODO: Combine audio and video into single file
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        
        setRecordings(prev => [...prev, {
          id: Date.now(),
          timestamp,
          videoBlob,
          audioBlob,
          name: `recording-${timestamp}`
        }]);
        
        chunks.length = 0;
      };
      
      mediaRecorderRef.current.start();
      setIsRecording(true);
      
    } catch (error) {
      console.error('Error starting recording:', error);
      alert('Failed to start recording: ' + error.message);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };
  
  const audioBufferToBlob = async (audioBuffer) => {
    const numberOfChannels = audioBuffer.numberOfChannels;
    const length = audioBuffer.length;
    const sampleRate = audioBuffer.sampleRate;
    
    // Create a WAV file
    const arrayBuffer = new ArrayBuffer(44 + length * numberOfChannels * 2);
    const view = new DataView(arrayBuffer);
    
    // WAV header
    const writeString = (offset, string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };
    
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + length * numberOfChannels * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numberOfChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numberOfChannels * 2, true);
    view.setUint16(32, numberOfChannels * 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, length * numberOfChannels * 2, true);
    
    // Write audio data
    let offset = 44;
    for (let i = 0; i < length; i++) {
      for (let channel = 0; channel < numberOfChannels; channel++) {
        const sample = Math.max(-1, Math.min(1, audioBuffer.getChannelData(channel)[i]));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
        offset += 2;
      }
    }
    
    return new Blob([arrayBuffer], { type: 'audio/wav' });
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
                    onClick={startAudioSystem}
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