document.addEventListener("DOMContentLoaded", () => {
    //fill your ip address and port here
    let websocketUrl="ws://ip:port/api/realtime-api";

    // Echo realtime chat history
    // Retrieve chat history from local storage
    let realtimeChatHistory = localStorage.getItem("realtimeChatHistory");
    // Convert to JSON format
    realtimeChatHistory = realtimeChatHistory ? JSON.parse(realtimeChatHistory) : [];

    // Select the chat container
    const chatContainer = document.querySelector('.ah-character-chat');

    // Clear the container to prevent duplicate rendering
    chatContainer.innerHTML = '';

    // If chat history exists, render messages
    realtimeChatHistory.forEach((message) => {
        const chatItem = document.createElement('div');
        chatItem.classList.add('character-chat-item');
        chatItem.classList.add(message.role === 'user' ? 'item-user' : 'item-character');

        const messageText = document.createElement('span');

        // Parse Markdown format of the message content using marked.parse()
        messageText.innerHTML = marked.parse(message.content);

        // Add the rendered message content to the chat item
        chatItem.appendChild(messageText);
        chatContainer.appendChild(chatItem);

        // Highlight the code in the current chat item using Prism
        Prism.highlightAllUnder(chatItem);
    });

    // Scroll to the bottom of the chat container
    chatContainer.scrollTop = chatContainer.scrollHeight;

    // Get the call button
    const realtimeButton = document.getElementById('btnRealtime');

    // WebSocket connection
    let socket;
    let audioContext;
    let audioProcessor;
    let audioStream;

    // Current audio source being played
    let currentAudioSource = null;

    let audioQueue = []; // Used to store audio segments
    let isPlaying = false; // Flag to indicate whether audio is currently playing
    // Use a Map to store the span element corresponding to each response_id
    let responseSpans = new Map();

    // Define a cache object to accumulate incomplete Markdown content
    let markdownBuffer = new Map();

    async function startWebSocket() {
        socket = new WebSocket(websocketUrl);

        socket.onopen = function () {
            console.log("WebSocket connected");
        };

        socket.onmessage = function (event) {
            const data = JSON.parse(event.data);
            handleReceivedMessage(data);
        };

        socket.onerror = function (error) {
            console.error("WebSocket error: ", error);
        };

        socket.onclose = async function (event) {
            // Prompt for insufficient points
            if (event.reason === 'Insufficient points') showErrorTip("You need more points to complete this action.");
            console.log("WebSocket closed", event.code, event.reason);
            stopRecording();

            // Clear span record elements
            responseSpans = new Map();
        };
    }

    function showErrorTip(message) {
        const realtimeButton = document.getElementById('btnRealtime');
        if (realtimeButton.classList.contains('active')) {
            realtimeButton.click();
        }
        const errorTip = document.getElementById("errorTipRealtime");
        errorTip.textContent = message;
        errorTip.style.display = "block";
        errorTip.style.opacity = "1";
        errorTip.style.visibility = "visible";
        // Automatically hide the error tip after 3 seconds
        setTimeout(() => {
            errorTip.style.opacity = "0";
            errorTip.style.visibility = "hidden";
            setTimeout(() => {
                errorTip.style.display = "none";
            }, 500);
        }, 3000);
    }

    // Session initialization configuration
    async function sendSessionUpdate() {
        const conversationHistory = realtimeChatHistory ? realtimeChatHistory : [];

        // Session configuration
        const sessionConfig = {
            type: "session.update",
            session: {
                instructions: "Please use function call results to generate responses when the user's request requires a task beyond the current capabilities of yours. Now you can deal with anything. please use function call especially when the output is related to different modalities such as image, audio, and video.",
                turn_detection: {
                    type: "server_vad",
                    threshold: 0.5,
                    prefix_padding_ms: 300,
                    silence_duration_ms: 500
                },
                voice: "alloy",
                temperature: 1,
                max_response_output_tokens: 4096,
                modalities: ["text", "audio"],
                input_audio_format: "pcm16",
                output_audio_format: "pcm16",
                input_audio_transcription: {
                    model: "whisper-1"
                },
                tools: [
                    {
                        type: "function",
                        name: "search_washington_weather",
                        description: "",
                        parameters: {
                            type: "object",
                            properties: {
                                location: {
                                    type: "string",
                                    description: "The location of the weather search"
                                }
                            },
                            required: ["location"]
                        }
                    }
                ]
            }
        };

        // Send session update
        try {
            console.log("Sending session update:", JSON.stringify(sessionConfig));
            socket.send(JSON.stringify(sessionConfig));
        } catch (e) {
            console.error("Error sending session update:", e);
        }

        // Send historical conversation items one by one
        conversationHistory.forEach((msg) => {
            const messageConfig = {
                type: "conversation.item.create",
                item: {
                    type: "message",
                    role: msg.role, // 'user' or 'assistant'
                    content: [
                        {
                            type: "input_text", // Change back to text
                            text: msg.content
                        }
                    ]
                }
            };

            // Send historical conversation items
            try {
                console.log("Sending message:", JSON.stringify(messageConfig));
                socket.send(JSON.stringify(messageConfig));
            } catch (e) {
                console.error("Error sending message:", e);
            }
        });
    }

// Handle WebSocket messages based on event types
    async function handleReceivedMessage(data) {

        switch (data.type) {
            // Create session and send configuration
            case "session.created":
                console.log("Session created, sending session update.");
                await sendSessionUpdate();
                break;

            // Configuration completed, session established
            case "session.updated":
                console.log("Session updated. Ready to receive audio.");
                startRecording(); // Start recording after the session is updated
                break;

            // User started speaking
            case "input_audio_buffer.speech_started":
                console.log("Speech started detected by server.");
                stopCurrentAudioPlayback(); // Stop the currently playing audio
                audioQueue = []; // Clear the current audio queue
                isPlaying = false; // Reset playback status
                break;

            // User stopped speaking
            case "input_audio_buffer.speech_stopped":
                console.log("Speech stopped detected by server.");
                break;

            // Complete transcription of the user's input
            case "conversation.item.input_audio_transcription.completed":
                console.log("Received transcription: " + data.transcript);
                // Render user's message
                const userMessageContainer = document.createElement('div');
                userMessageContainer.classList.add('character-chat-item', 'item-user');

                const userMessage = document.createElement('span');
                userMessage.textContent = data.transcript; // Display the transcribed user input text
                userMessageContainer.appendChild(userMessage);

                // Add the user's message to the chat container
                const chatContent = document.querySelector('.ah-character-chat');
                chatContent.appendChild(userMessageContainer);

                // Scroll to the latest message
                chatContent.scrollTop = chatContent.scrollHeight;

                // Update local chat history
                realtimeChatHistory.push({role: "user", content: data.transcript});
                localStorage.setItem('realtimeChatHistory', JSON.stringify(realtimeChatHistory)); // Update chat history for all roles
                break;

            // Response with streaming text
            case "response.audio_transcript.delta":
                const transcript = data.delta; // Incremental content
                const responseId = data.response_id;

                console.log("Transcript delta for response_id:", responseId, " Delta: ", transcript);

                // Check if a cache for the corresponding response_id exists
                if (!markdownBuffer.has(responseId)) {
                    markdownBuffer.set(responseId, ""); // Initialize the cache
                }

                // Append incremental content to the cache
                const existingBuffer = markdownBuffer.get(responseId);
                markdownBuffer.set(responseId, existingBuffer + transcript);

                // Update UI
                let aiMessageSpan = responseSpans.get(responseId);

                if (!aiMessageSpan) {
                    // If not found, create a new chat container
                    const aiMessageContainer = document.createElement('div');
                    aiMessageContainer.classList.add('character-chat-item', 'item-character');

                    // Create a span element for displaying the message
                    aiMessageSpan = document.createElement('span');
                    aiMessageSpan.classList.add('markdown-content'); // Add a class for styling
                    aiMessageContainer.appendChild(aiMessageSpan);

                    // Add the new container to the chat
                    const chatContainer = document.querySelector('.ah-character-chat');
                    chatContainer.appendChild(aiMessageContainer);

                    // Associate the span element with the response_id
                    responseSpans.set(responseId, aiMessageSpan);
                }

                // Get the complete content and parse it
                const fullContent = markdownBuffer.get(responseId);
                const parsedContent = marked.parse(fullContent); // Parse the complete Markdown content

                // Safely update the UI
                aiMessageSpan.innerHTML = parsedContent;

                // Highlight code blocks
                Prism.highlightAllUnder(aiMessageSpan);

                // Scroll to the latest message
                const chatContainer = document.querySelector('.ah-character-chat');
                chatContainer.scrollTop = chatContainer.scrollHeight;

                break;

            // Response with streaming audio
            case "response.audio.delta":
                if (data.delta) {
                    const audioData = Uint8Array.from(atob(data.delta), c => c.charCodeAt(0));
                    audioQueue.push(audioData); // Add the audio segment to the queue
                    if (!isPlaying) {
                        playNextAudio(); // Play immediately if no audio is currently playing
                    }
                }
                break;

            // Complete transcription of the response
            case "response.audio_transcript.done":
                console.log("Received transcription: " + data.transcript);
                // Update local chat history
                realtimeChatHistory.push({role: "assistant", content: data.transcript});
                localStorage.setItem('realtimeChatHistory', JSON.stringify(realtimeChatHistory));
                break;

            // Audio response finished
            case "response.audio.done":
                console.log("Audio response complete.");
                isPlaying = false; // Mark playback as finished
                break;

            // Function call
            case "response.function_call_arguments.done":
                console.log("data：" + data)
                handleFunctionCall(data);
                break;

            default:
                console.warn("Unhandled event type: " + data.type);
        }
    }

    // Handle function calls
    function handleFunctionCall(eventJson) {
        try {
            const arguments = eventJson.arguments;
            const functionCallArgs = JSON.parse(arguments);
            const location = functionCallArgs.location;
            const callId = eventJson.call_id;

            if (location) {
                // Call the handleWithMemAgent method to process user input
                let weather = handle(location);
                // Log the response result
                console.log("Result from backend: " + weather);
                // Return the result to the caller
                sendFunctionCallResult(weather, callId);
            } else {
                console.log("City not provided for get_weather function.");
            }
        } catch (error) {
            console.error("Error parsing function call arguments: ", error);
        }
    }

    function handle(location) {
        return "20 ℃";
    }

// Send the function call result to the server
    function sendFunctionCallResult(result, callId) {
        const resultJson = {
            type: "conversation.item.create",
            item: {
                type: "function_call_output",
                output: result,
                call_id: callId
            }
        };

        socket.send(JSON.stringify(resultJson));
        console.log("Sent function call result: ", resultJson);

        // Proactively request a response.create to fetch the result
        const rpJson = {
            type: "response.create"
        };
        socket.send(JSON.stringify(rpJson));
        console.log("Response sent: ", rpJson);
    }


    // Stop the current audio playback
    function stopCurrentAudioPlayback() {
        if (currentAudioSource) {
            currentAudioSource.stop();
            currentAudioSource = null;
            console.log("Current audio playback stopped.");
        }
    }

    // Start getting the input audio
    function startRecording() {
        navigator.mediaDevices.getUserMedia({audio: true})
            .then(stream => {
                audioContext = new (window.AudioContext || window.webkitAudioContext)({sampleRate: 24000});
                audioStream = stream;
                const source = audioContext.createMediaStreamSource(stream);
                // 增加缓冲区大小到 8192
                audioProcessor = audioContext.createScriptProcessor(8192, 1, 1);

                audioProcessor.onaudioprocess = (event) => {
                    if (socket && socket.readyState === WebSocket.OPEN) {
                        const inputBuffer = event.inputBuffer.getChannelData(0);
                        const pcmData = floatTo16BitPCM(inputBuffer);
                        const base64PCM = base64EncodeAudio(new Uint8Array(pcmData));

                        // 增加音频块大小到 4096
                        const chunkSize = 4096;
                        for (let i = 0; i < base64PCM.length; i += chunkSize) {
                            const chunk = base64PCM.slice(i, i + chunkSize);
                            socket.send(JSON.stringify({type: "input_audio_buffer.append", audio: chunk}));
                        }
                    }
                };

                source.connect(audioProcessor);
                audioProcessor.connect(audioContext.destination);
                console.log("Recording started");
            })
            .catch(error => {
                console.error("Unable to access the microphone: ", error);
            });
    }

    // Transcoding
    function floatTo16BitPCM(float32Array) {
        const buffer = new ArrayBuffer(float32Array.length * 2);
        const view = new DataView(buffer);
        let offset = 0;
        for (let i = 0; i < float32Array.length; i++, offset += 2) {
            let s = Math.max(-1, Math.min(1, float32Array[i]));
            view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
        }
        return buffer;
    }

    // Transcoding
    function base64EncodeAudio(uint8Array) {
        let binary = '';
        const chunkSize = 0x8000; // Maintain a block size of 32KB
        for (let i = 0; i < uint8Array.length; i += chunkSize) {
            const chunk = uint8Array.subarray(i, i + chunkSize);
            binary += String.fromCharCode.apply(null, chunk);
        }
        return btoa(binary);
    }


    // Stop getting input audio
    function stopRecording() {
        if (audioProcessor) {
            audioProcessor.disconnect();
        }
        if (audioStream) {
            audioStream.getTracks().forEach(track => track.stop());
        }
        if (socket) {
            socket.close();
        }
    }


    // Play the next audio
    function playNextAudio() {
        if (audioQueue.length > 0) {
            isPlaying = true;
            const audioData = audioQueue.shift(); // Remove an audio clip from the queue
            playPCM(audioData, playNextAudio); // Play the audio
        } else {
            isPlaying = false;
        }
    }

    // Play AI's streaming audio response
    function playPCM(pcmBuffer, callback) {
        const wavBuffer = createWavBuffer(pcmBuffer, 24000);
        audioContext.decodeAudioData(wavBuffer, function (audioBuffer) {
            const source = audioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(audioContext.destination);
            source.onended = callback;// Call the callback after the audio is played
            source.start(0);
            currentAudioSource = source;
            console.log("Audio played successfully.");
        }, function (error) {
            console.error("Error decoding audio data", error);
            callback(); // If decoding fails, continue to play the next audio
        });
    }

    //Put the AI's streaming audio response into the buffer to play
    function createWavBuffer(pcmBuffer, sampleRate) {
        const wavHeader = new ArrayBuffer(44);
        const view = new DataView(wavHeader);

        // RIFF header
        writeString(view, 0, 'RIFF');
        view.setUint32(4, 36 + pcmBuffer.byteLength, true); // Chunk size
        writeString(view, 8, 'WAVE');

        // fmt subchunk
        writeString(view, 12, 'fmt ');
        view.setUint32(16, 16, true); // Subchunk1 size (16 for PCM)
        view.setUint16(20, 1, true);  // Audio format (1 for PCM)
        view.setUint16(22, 1, true);  // Number of channels (1 for mono)
        view.setUint32(24, sampleRate, true); // Sample rate
        view.setUint32(28, sampleRate * 2, true); // Byte rate (Sample Rate * Block Align)
        view.setUint16(32, 2, true);  // Block align (Channels * Bits per sample / 8)
        view.setUint16(34, 16, true); // Bits per sample

        // data subchunk
        writeString(view, 36, 'data');
        view.setUint32(40, pcmBuffer.byteLength, true); // Subchunk2 size

        function writeString(view, offset, string) {
            for (let i = 0; i < string.length; i++) {
                view.setUint8(offset + i, string.charCodeAt(i));
            }
        }

        return concatenateBuffers(wavHeader, pcmBuffer);
    }

    function concatenateBuffers(buffer1, buffer2) {
        const tmp = new Uint8Array(buffer1.byteLength + buffer2.byteLength);
        tmp.set(new Uint8Array(buffer1), 0);
        tmp.set(new Uint8Array(buffer2), buffer1.byteLength);
        return tmp.buffer;
    }

    realtimeButton.addEventListener('click', async function () {
        if (realtimeButton.classList.contains('active')) {
            realtimeButton.classList.remove('active');
            stopRecording();

            audioQueue = []; // 清空
            isPlaying = false; // 标记当前是否正在播放
        } else {
            realtimeButton.classList.add('active');
            startWebSocket();
        }
    });

});
