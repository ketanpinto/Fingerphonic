class VoiceFilterApp {
    constructor() {
        this.audioContext = null;
        this.mediaStream = null;
        this.audioSource = null;
        this.videoElement = null;
        this.mediaRecorder = null;
        this.recordedChunks = [];
        this.isRecording = false;
        this.recordingStartTime = 0;
        this.recordingInterval = null;
        
        // Audio nodes for filters
        this.filters = {
            chorus: null,
            distortion: null,
            reverb: null,
            echo: null
        };
        
        this.activeFilters = new Set();
        
        // For recording with filters
        this.filteredAudioDestination = null;
        this.recordingStream = null;
        
        // MediaPipe Hands
        this.hands = null;
        this.camera = null;
        this.canvasElement = null;
        this.canvasCtx = null;
        this.lastGesture = null;
        this.gestureCooldown = 0;
        
        // Settings and controls
        this.settings = {
            masterVolume: 0.5,
            chorusDepth: 0.002,
            chorusRate: 1.5,
            distortionAmount: 400,
            reverbDuration: 0.5,
            reverbDecay: 0.1,
            echoDelay: 0.3,
            echoFeedback: 0.3,
            mirrorVideo: true
        };
        
        // Master volume control
        this.masterGain = null;
        
        this.initializeElements();
        this.bindEvents();
    }

    initializeElements() {
        this.videoElement = document.getElementById('videoPreview');
        this.canvasElement = document.getElementById('handCanvas');
        this.canvasCtx = this.canvasElement.getContext('2d');
        this.filterIndicator = document.getElementById('filterIndicator');
        this.gestureIndicator = document.getElementById('gestureIndicator');
        this.statusMessage = document.getElementById('statusMessage');
        this.recordingTime = document.getElementById('recordingTime');
        this.startRecordingBtn = document.getElementById('startRecording');
        this.stopRecordingBtn = document.getElementById('stopRecording');
        this.playRecordingBtn = document.getElementById('playRecording');
        this.downloadRecordingBtn = document.getElementById('downloadRecording');
        
        // Settings modal elements
        this.settingsModal = document.getElementById('settingsModal');
        this.settingsBtn = document.getElementById('settingsBtn');
        this.closeSettingsBtn = document.querySelector('.close');
        this.closeSettingsBtn2 = document.getElementById('closeSettings');
        this.resetSettingsBtn = document.getElementById('resetSettings');
        
        // Playback elements
        this.playbackSection = document.getElementById('playbackSection');
        this.playbackVideo = document.getElementById('playbackVideo');
    }

    bindEvents() {
        // Recording controls
        this.startRecordingBtn.addEventListener('click', () => this.startRecording());
        this.stopRecordingBtn.addEventListener('click', () => this.stopRecording());
        this.playRecordingBtn.addEventListener('click', () => this.playRecording());
        this.downloadRecordingBtn.addEventListener('click', () => this.downloadRecording());
        
        // Settings modal
        this.settingsBtn.addEventListener('click', () => this.openSettings());
        this.closeSettingsBtn.addEventListener('click', () => this.closeSettings());
        this.closeSettingsBtn2.addEventListener('click', () => this.closeSettings());
        this.resetSettingsBtn.addEventListener('click', () => this.resetSettings());
        
        // Close modal when clicking outside
        window.addEventListener('click', (event) => {
            if (event.target === this.settingsModal) {
                this.closeSettings();
            }
        });
        
        // Initialize settings controls
        this.initializeSettingsControls();
        
        // Initialize app
        this.initializeApp();
    }

    initializeSettingsControls() {
        // Master volume
        const masterVolumeSlider = document.getElementById('masterVolume');
        const masterVolumeValue = document.getElementById('masterVolumeValue');
        
        masterVolumeSlider.addEventListener('input', (e) => {
            const value = e.target.value;
            this.settings.masterVolume = value / 100;
            masterVolumeValue.textContent = `${value}%`;
            this.updateMasterVolume();
        });
        
        // Chorus controls
        const chorusDepthSlider = document.getElementById('chorusDepth');
        const chorusDepthValue = document.getElementById('chorusDepthValue');
        const chorusRateSlider = document.getElementById('chorusRate');
        const chorusRateValue = document.getElementById('chorusRateValue');
        
        chorusDepthSlider.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            this.settings.chorusDepth = value;
            chorusDepthValue.textContent = value.toFixed(3);
            this.updateChorusFilter();
        });
        
        chorusRateSlider.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            this.settings.chorusRate = value;
            chorusRateValue.textContent = `${value} Hz`;
            this.updateChorusFilter();
        });
        
        // Distortion controls
        const distortionAmountSlider = document.getElementById('distortionAmount');
        const distortionAmountValue = document.getElementById('distortionAmountValue');
        
        distortionAmountSlider.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            this.settings.distortionAmount = value;
            distortionAmountValue.textContent = value;
            this.updateDistortionFilter();
        });
        
        // Reverb controls
        const reverbDurationSlider = document.getElementById('reverbDuration');
        const reverbDurationValue = document.getElementById('reverbDurationValue');
        const reverbDecaySlider = document.getElementById('reverbDecay');
        const reverbDecayValue = document.getElementById('reverbDecayValue');
        
        reverbDurationSlider.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            this.settings.reverbDuration = value;
            reverbDurationValue.textContent = `${value}s`;
            this.updateReverbFilter();
        });
        
        reverbDecaySlider.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            this.settings.reverbDecay = value;
            reverbDecayValue.textContent = value.toFixed(2);
            this.updateReverbFilter();
        });
        
        // Echo controls
        const echoDelaySlider = document.getElementById('echoDelay');
        const echoDelayValue = document.getElementById('echoDelayValue');
        const echoFeedbackSlider = document.getElementById('echoFeedback');
        const echoFeedbackValue = document.getElementById('echoFeedbackValue');
        
        echoDelaySlider.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            this.settings.echoDelay = value;
            echoDelayValue.textContent = `${value}s`;
            this.updateEchoFilter();
        });
        
        echoFeedbackSlider.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            this.settings.echoFeedback = value;
            echoFeedbackValue.textContent = value.toFixed(2);
            this.updateEchoFilter();
        });
        
        // Mirror video checkbox
        const mirrorVideoCheckbox = document.getElementById('mirrorVideo');
        mirrorVideoCheckbox.addEventListener('change', (e) => {
            this.settings.mirrorVideo = e.target.checked;
            this.updateVideoMirroring();
        });
        
        // Set initial values
        this.updateSettingsDisplay();
    }

    updateSettingsDisplay() {
        // Update sliders to match current settings
        document.getElementById('masterVolume').value = this.settings.masterVolume * 100;
        document.getElementById('masterVolumeValue').textContent = `${Math.round(this.settings.masterVolume * 100)}%`;
        
        document.getElementById('chorusDepth').value = this.settings.chorusDepth;
        document.getElementById('chorusDepthValue').textContent = this.settings.chorusDepth.toFixed(3);
        document.getElementById('chorusRate').value = this.settings.chorusRate;
        document.getElementById('chorusRateValue').textContent = `${this.settings.chorusRate} Hz`;
        
        document.getElementById('distortionAmount').value = this.settings.distortionAmount;
        document.getElementById('distortionAmountValue').textContent = this.settings.distortionAmount;
        
        document.getElementById('reverbDuration').value = this.settings.reverbDuration;
        document.getElementById('reverbDurationValue').textContent = `${this.settings.reverbDuration}s`;
        document.getElementById('reverbDecay').value = this.settings.reverbDecay;
        document.getElementById('reverbDecayValue').textContent = this.settings.reverbDecay.toFixed(2);
        
        document.getElementById('echoDelay').value = this.settings.echoDelay;
        document.getElementById('echoDelayValue').textContent = `${this.settings.echoDelay}s`;
        document.getElementById('echoFeedback').value = this.settings.echoFeedback;
        document.getElementById('echoFeedbackValue').textContent = this.settings.echoFeedback.toFixed(2);
        
        document.getElementById('mirrorVideo').checked = this.settings.mirrorVideo;
    }

    openSettings() {
        this.settingsModal.style.display = 'block';
    }

    closeSettings() {
        this.settingsModal.style.display = 'none';
    }

    resetSettings() {
        this.settings = {
            masterVolume: 0.5,
            chorusDepth: 0.002,
            chorusRate: 1.5,
            distortionAmount: 400,
            reverbDuration: 0.5,
            reverbDecay: 0.1,
            echoDelay: 0.3,
            echoFeedback: 0.3,
            mirrorVideo: true
        };
        
        this.updateSettingsDisplay();
        this.updateAllFilters();
        this.updateMasterVolume();
        this.updateVideoMirroring();
    }

    updateVideoMirroring() {
        const transform = this.settings.mirrorVideo ? 'scaleX(-1)' : 'scaleX(1)';
        this.videoElement.style.transform = transform;
        this.canvasElement.style.transform = transform;
        if (this.playbackVideo.src) {
            this.playbackVideo.style.transform = transform;
        }
    }

    updateMasterVolume() {
        if (this.masterGain) {
            this.masterGain.gain.value = this.settings.masterVolume;
        }
    }

    updateChorusFilter() {
        if (this.filters.chorus && this.filters.chorus.lfo && this.filters.chorus.lfoGain) {
            this.filters.chorus.lfo.frequency.value = this.settings.chorusRate;
            this.filters.chorus.lfoGain.gain.value = this.settings.chorusDepth;
        }
    }

    updateDistortionFilter() {
        if (this.filters.distortion) {
            this.filters.distortion.curve = this.makeDistortionCurve(this.settings.distortionAmount);
        }
    }

    updateReverbFilter() {
        if (this.filters.reverb) {
            this.filters.reverb.buffer = this.createReverbImpulse();
        }
    }

    updateEchoFilter() {
        if (this.filters.echo && this.filters.echo.delay && this.filters.echo.gain) {
            this.filters.echo.delay.delayTime.value = this.settings.echoDelay;
            this.filters.echo.gain.gain.value = this.settings.echoFeedback;
        }
    }

    updateAllFilters() {
        this.updateChorusFilter();
        this.updateDistortionFilter();
        this.updateReverbFilter();
        this.updateEchoFilter();
    }

    async initializeApp() {
        try {
            this.updateStatus('Initializing...');
            
            // Get user media (audio and video)
            this.mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false
                },
                video: {
                    width: { ideal: 640 },
                    height: { ideal: 480 }
                }
            });

            // Set up video preview
            this.videoElement.srcObject = this.mediaStream;
            
            // Initialize audio context
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            // Create master gain for volume control
            this.masterGain = this.audioContext.createGain();
            this.masterGain.gain.value = this.settings.masterVolume;
            
            // Create audio source from microphone
            this.audioSource = this.audioContext.createMediaStreamSource(this.mediaStream);
            
            // Create destination for filtered audio
            this.filteredAudioDestination = this.audioContext.createMediaStreamDestination();
            
            // Initialize filters
            this.initializeFilters();
            
            // Initialize MediaPipe Hands
            await this.initializeMediaPipe();
            
            // Apply initial video mirroring
            this.updateVideoMirroring();
            
            this.updateStatus('Ready! Show your hand to the camera for gesture detection.');
            
        } catch (error) {
            console.error('Error initializing app:', error);
            this.updateStatus('Error: Could not access microphone/camera. Please check permissions.');
        }
    }

    async initializeMediaPipe() {
        try {
            this.hands = new Hands({
                locateFile: (file) => {
                    return `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1646424915/${file}`;
                }
            });

            this.hands.setOptions({
                maxNumHands: 1,
                modelComplexity: 1,
                minDetectionConfidence: 0.5,
                minTrackingConfidence: 0.5
            });

            this.hands.onResults((results) => this.onHandResults(results));

            this.camera = new Camera(this.videoElement, {
                onFrame: async () => {
                    await this.hands.send({ image: this.videoElement });
                },
                width: 640,
                height: 480
            });

            await this.camera.start();
            console.log('MediaPipe Hands initialized successfully');
            
        } catch (error) {
            console.error('Error initializing MediaPipe:', error);
            this.updateStatus('Error initializing hand detection. Please refresh the page.');
        }
    }

    onHandResults(results) {
        // Set canvas size to match video
        this.canvasElement.width = this.videoElement.videoWidth;
        this.canvasElement.height = this.videoElement.videoHeight;
        
        // Clear canvas
        this.canvasCtx.save();
        this.canvasCtx.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);
        
        // Draw the video frame
        this.canvasCtx.drawImage(results.image, 0, 0, this.canvasElement.width, this.canvasElement.height);

        if (results.multiHandLandmarks) {
            for (const landmarks of results.multiHandLandmarks) {
                // Draw hand landmarks manually since drawConnectors might not be available
                this.drawHandLandmarks(landmarks);
                
                // Detect gesture
                const gesture = this.detectGesture(landmarks);
                if (gesture && this.gestureCooldown <= 0) {
                    this.handleGesture(gesture);
                    this.gestureCooldown = 30; // Prevent rapid switching
                }
            }
        }

        this.canvasCtx.restore();
        
        // Update gesture cooldown
        if (this.gestureCooldown > 0) {
            this.gestureCooldown--;
        }
    }

    drawHandLandmarks(landmarks) {
        // Draw connections between landmarks
        const connections = [
            [0, 1], [1, 2], [2, 3], [3, 4], // thumb
            [0, 5], [5, 6], [6, 7], [7, 8], // index finger
            [0, 9], [9, 10], [10, 11], [11, 12], // middle finger
            [0, 13], [13, 14], [14, 15], [15, 16], // ring finger
            [0, 17], [17, 18], [18, 19], [19, 20], // pinky
            [0, 5], [5, 9], [9, 13], [13, 17] // palm connections
        ];

        // Draw connections
        this.canvasCtx.strokeStyle = '#00FF00';
        this.canvasCtx.lineWidth = 2;
        this.canvasCtx.beginPath();
        
        for (const [start, end] of connections) {
            const startPoint = landmarks[start];
            const endPoint = landmarks[end];
            
            this.canvasCtx.moveTo(
                startPoint.x * this.canvasElement.width,
                startPoint.y * this.canvasElement.height
            );
            this.canvasCtx.lineTo(
                endPoint.x * this.canvasElement.width,
                endPoint.y * this.canvasElement.height
            );
        }
        this.canvasCtx.stroke();

        // Draw landmarks
        this.canvasCtx.fillStyle = '#FF0000';
        for (const landmark of landmarks) {
            this.canvasCtx.beginPath();
            this.canvasCtx.arc(
                landmark.x * this.canvasElement.width,
                landmark.y * this.canvasElement.height,
                3, 0, 2 * Math.PI
            );
            this.canvasCtx.fill();
        }
    }

    detectGesture(landmarks) {
        // Get finger tip and pip (middle joint) landmarks
        const fingerTips = [4, 8, 12, 16, 20]; // thumb, index, middle, ring, pinky
        const fingerPips = [3, 6, 10, 14, 18]; // corresponding middle joints
        
        let extendedFingers = 0;
        
        // Check each finger
        for (let i = 0; i < 5; i++) {
            const tip = landmarks[fingerTips[i]];
            const pip = landmarks[fingerPips[i]];
            
            // For thumb, check horizontal position
            if (i === 0) {
                if (tip.x > pip.x) {
                    extendedFingers++;
                }
            } else {
                // For other fingers, check vertical position
                if (tip.y < pip.y) {
                    extendedFingers++;
                }
            }
        }
        
        // Determine gesture based on extended fingers
        if (extendedFingers === 0) {
            return 'fist';
        } else if (extendedFingers >= 1 && extendedFingers <= 4) {
            return `${extendedFingers}_fingers`;
        }
        
        return null;
    }

    handleGesture(gesture) {
        if (gesture === this.lastGesture) return;
        
        this.lastGesture = gesture;
        console.log('Detected gesture:', gesture);
        
        switch(gesture) {
            case '1_fingers':
                this.applyFilter('chorus');
                break;
            case '2_fingers':
                this.applyFilter('distortion');
                break;
            case '3_fingers':
                this.applyFilter('reverb');
                break;
            case '4_fingers':
                this.applyFilter('echo');
                break;
            case 'fist':
                this.clearAllFilters();
                break;
        }
        
        this.updateGestureIndicator(gesture);
    }

    applyFilter(filterName) {
        // Clear all filters first
        this.clearAllFilters();
        
        // Apply the new filter
        this.addFilter(filterName);
        this.updateFilterIndicator();
    }

    updateGestureIndicator(gesture) {
        const gestureNames = {
            '1_fingers': '👆 1 Finger - Chorus',
            '2_fingers': '✌️ 2 Fingers - Distortion',
            '3_fingers': '🤟 3 Fingers - Reverb',
            '4_fingers': '🖖 4 Fingers - Echo',
            'fist': '✊ Fist - Clear All'
        };
        
        this.gestureIndicator.textContent = gestureNames[gesture] || 'No Gesture Detected';
    }

    initializeFilters() {
        // Create filter nodes
        this.filters.chorus = this.createChorusFilter();
        this.filters.distortion = this.createDistortionFilter();
        this.filters.reverb = this.createReverbFilter();
        this.filters.echo = this.createEchoFilter();
        
        // Connect audio source through master gain to both live playback and recording destination
        this.audioSource.connect(this.masterGain);
        this.masterGain.connect(this.audioContext.destination);
        this.masterGain.connect(this.filteredAudioDestination);
    }

    createChorusFilter() {
        const chorus = this.audioContext.createGain();
        const lfo = this.audioContext.createOscillator();
        const lfoGain = this.audioContext.createGain();
        
        lfo.frequency.value = this.settings.chorusRate;
        lfoGain.gain.value = this.settings.chorusDepth;
        
        lfo.connect(lfoGain);
        lfoGain.connect(chorus.gain);
        lfo.start();
        
        // Store references for updating
        chorus.lfo = lfo;
        chorus.lfoGain = lfoGain;
        
        return chorus;
    }

    createDistortionFilter() {
        const distortion = this.audioContext.createWaveShaper();
        distortion.curve = this.makeDistortionCurve(this.settings.distortionAmount);
        distortion.oversample = '4x';
        
        return distortion;
    }

    makeDistortionCurve(amount) {
        const k = typeof amount === 'number' ? amount : 50;
        const n_samples = 44100;
        const curve = new Float32Array(n_samples);
        const deg = Math.PI / 180;
        
        for (let i = 0; i < n_samples; ++i) {
            const x = (i * 2) / n_samples - 1;
            curve[i] = (3 + k) * x * 20 * deg / (Math.PI + k * Math.abs(x));
        }
        return curve;
    }

    createReverbFilter() {
        const reverb = this.audioContext.createConvolver();
        reverb.buffer = this.createReverbImpulse();
        return reverb;
    }

    createReverbImpulse() {
        const impulseLength = this.audioContext.sampleRate * this.settings.reverbDuration;
        const impulse = this.audioContext.createBuffer(2, impulseLength, this.audioContext.sampleRate);
        
        for (let channel = 0; channel < 2; channel++) {
            const channelData = impulse.getChannelData(channel);
            for (let i = 0; i < impulseLength; i++) {
                channelData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (impulseLength * this.settings.reverbDecay));
            }
        }
        
        return impulse;
    }

    createEchoFilter() {
        const echo = this.audioContext.createDelay(1.0);
        const echoGain = this.audioContext.createGain();
        
        echo.delayTime.value = this.settings.echoDelay;
        echoGain.gain.value = this.settings.echoFeedback;
        
        echo.connect(echoGain);
        echoGain.connect(echo);
        
        return { delay: echo, gain: echoGain };
    }

    addFilter(filterName) {
        if (this.activeFilters.has(filterName)) return;
        
        this.activeFilters.add(filterName);
        
        // Disconnect from both destinations
        this.masterGain.disconnect();
        
        // Connect through the filter for live playback
        let currentNode = this.masterGain;
        
        // Connect all active filters in series
        for (const activeFilter of this.activeFilters) {
            if (activeFilter === 'echo') {
                currentNode.connect(this.filters.echo.delay);
                currentNode = this.filters.echo.delay;
            } else {
                currentNode.connect(this.filters[activeFilter]);
                currentNode = this.filters[activeFilter];
            }
        }
        
        // Connect to live playback destination
        currentNode.connect(this.audioContext.destination);
        
        // Connect filtered audio to recording destination
        currentNode.connect(this.filteredAudioDestination);
        
        console.log(`Added filter: ${filterName}`);
    }

    clearAllFilters() {
        this.activeFilters.clear();
        this.reconnectFilters();
        this.updateFilterIndicator();
        console.log('Cleared all filters');
    }

    reconnectFilters() {
        // Disconnect from both destinations
        this.masterGain.disconnect();
        
        if (this.activeFilters.size === 0) {
            // No filters active, connect directly to both destinations
            this.masterGain.connect(this.audioContext.destination);
            this.masterGain.connect(this.filteredAudioDestination);
        } else {
            // Connect through active filters
            let currentNode = this.masterGain;
            
            for (const activeFilter of this.activeFilters) {
                if (activeFilter === 'echo') {
                    currentNode.connect(this.filters.echo.delay);
                    currentNode = this.filters.echo.delay;
                } else {
                    currentNode.connect(this.filters[activeFilter]);
                    currentNode = this.filters[activeFilter];
                }
            }
            
            // Connect to both destinations
            currentNode.connect(this.audioContext.destination);
            currentNode.connect(this.filteredAudioDestination);
        }
    }

    updateFilterIndicator() {
        if (this.activeFilters.size === 0) {
            this.filterIndicator.textContent = 'No Filter';
            this.filterIndicator.style.background = 'rgba(0,0,0,0.8)';
        } else {
            const filterNames = Array.from(this.activeFilters).map(name => 
                name.charAt(0).toUpperCase() + name.slice(1)
            );
            this.filterIndicator.textContent = filterNames.join(' + ');
            this.filterIndicator.style.background = 'rgba(102, 126, 234, 0.9)';
        }
    }

    startRecording() {
        if (this.isRecording) return;
        
        try {
            this.recordedChunks = [];
            this.isRecording = true;
            this.recordingStartTime = Date.now();
            
            // Create a new stream that combines video with filtered audio
            const videoTrack = this.mediaStream.getVideoTracks()[0];
            const filteredAudioTrack = this.filteredAudioDestination.stream.getAudioTracks()[0];
            
            this.recordingStream = new MediaStream([videoTrack, filteredAudioTrack]);
            
            // Create MediaRecorder with the combined stream
            this.mediaRecorder = new MediaRecorder(this.recordingStream, {
                mimeType: 'video/webm;codecs=vp9,opus'
            });
            
            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.recordedChunks.push(event.data);
                }
            };
            
            this.mediaRecorder.onstop = () => {
                this.isRecording = false;
                this.playRecordingBtn.disabled = false;
                this.downloadRecordingBtn.disabled = false;
                this.updateStatus('Recording complete! Click Play to preview or Download to save.');
            };
            
            this.mediaRecorder.start();
            
            // Update UI
            this.startRecordingBtn.disabled = true;
            this.stopRecordingBtn.disabled = false;
            this.playRecordingBtn.disabled = true;
            this.downloadRecordingBtn.disabled = true;
            
            this.updateStatus('Recording... Use hand gestures to change filters during recording.');
            
            // Start recording timer
            this.recordingInterval = setInterval(() => {
                const elapsed = Date.now() - this.recordingStartTime;
                const seconds = Math.floor(elapsed / 1000);
                const minutes = Math.floor(seconds / 60);
                const remainingSeconds = seconds % 60;
                this.recordingTime.textContent = 
                    `Recording time: ${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
            }, 1000);
            
        } catch (error) {
            console.error('Error starting recording:', error);
            this.updateStatus('Error starting recording. Please try again.');
        }
    }

    stopRecording() {
        if (!this.isRecording) return;
        
        this.mediaRecorder.stop();
        this.isRecording = false;
        
        // Update UI
        this.startRecordingBtn.disabled = false;
        this.stopRecordingBtn.disabled = true;
        
        // Stop timer
        if (this.recordingInterval) {
            clearInterval(this.recordingInterval);
            this.recordingInterval = null;
        }
        
        this.recordingTime.textContent = '';
    }

    playRecording() {
        if (this.recordedChunks.length === 0) {
            this.updateStatus('No recording available to play.');
            return;
        }
        
        const blob = new Blob(this.recordedChunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        
        this.playbackVideo.src = url;
        this.playbackSection.style.display = 'block';
        
        // Apply mirroring to playback video
        this.updateVideoMirroring();
        
        this.updateStatus('Playing recording...');
        
        // Clean up URL when video is done
        this.playbackVideo.onended = () => {
            URL.revokeObjectURL(url);
        };
    }

    downloadRecording() {
        if (this.recordedChunks.length === 0) {
            this.updateStatus('No recording available to download.');
            return;
        }
        
        const blob = new Blob(this.recordedChunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `voice-filter-recording-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.webm`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        this.updateStatus('Recording downloaded successfully!');
    }

    updateStatus(message) {
        this.statusMessage.textContent = message;
        console.log(message);
    }
}

// Initialize the app when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new VoiceFilterApp();
}); 