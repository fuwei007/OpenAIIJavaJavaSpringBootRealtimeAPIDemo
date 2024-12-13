package org.example.wep;

import okhttp3.*;

import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

/**
 * RealTimeSpeechHandler handles WebSocket communication for real-time speech processing.
 * It acts as a bridge between the client and OpenAI's Realtime API.
 */
@Component
public class RealTimeSpeechHandler extends TextWebSocketHandler {

    /** URL for the OpenAI Realtime API endpoint */
    private static final String OPENAI_WS_URL = "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01";

    /** OpenAI API key (replace with your own) */
    private static final String OPENAI_API_KEY = "sk-proj-xxx";

    /** OkHttpClient instance for creating HTTP connections */
    private final OkHttpClient client = new OkHttpClient();

    /** WebSocket connection to OpenAI Realtime API */
    private WebSocket openAIWebSocket;

    /** WebSocket session with the client */
    private WebSocketSession clientSession;

    /**
     * Invoked after a WebSocket connection with the client is established.
     * Establishes a separate WebSocket connection with the OpenAI Realtime API.
     * @param session the WebSocket session with the client
     * @throws Exception if an error occurs during connection establishment
     */
    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        this.clientSession = session;

        // Build request for OpenAI Realtime API connection
        Request request = new Request.Builder()
                .url(OPENAI_WS_URL)
                .addHeader("Authorization", "Bearer " + OPENAI_API_KEY)
                .addHeader("OpenAI-Beta", "realtime=v1")
                .build();

        // Create WebSocket connection to OpenAI Realtime API
        openAIWebSocket = client.newWebSocket(request, new WebSocketListener() {
            @Override
            public void onOpen(WebSocket webSocket, Response response) {
                System.out.println("Connected to OpenAI Realtime API.");
            }

            @Override
            public void onMessage(WebSocket webSocket, String text) {
                try {
                    if (clientSession.isOpen()) {
                        clientSession.sendMessage(new TextMessage(text));
                    }
                } catch (Exception e) {
                    System.err.println("Error forwarding message to client: " + e.getMessage());
                }
            }

            @Override
            public void onFailure(WebSocket webSocket, Throwable t, Response response) {
                System.err.println("OpenAI WebSocket connection failed: " + t.getMessage());
            }

            @Override
            public void onClosing(WebSocket webSocket, int code, String reason) {
                System.out.println("OpenAI WebSocket closed: " + reason);
            }
        });
    }

    /**
     * Handles incoming text messages from the client.
     * Forwards the message to the OpenAI Realtime API connection.
     * @param session the WebSocket session with the client
     * @param message the incoming text message
     * @throws Exception if an error occurs during message processing
     */
    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        if (openAIWebSocket != null) {
            openAIWebSocket.send(message.getPayload());
        }
    }

    /**
     * Invoked after the WebSocket connection with the client is closed.
     * Closes the connection with the OpenAI Realtime API if it's still open.
     * @param session the WebSocket session with the client
     * @param status the close status
     * @throws Exception if an error occurs during connection closure
     */
    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) throws Exception {
        if (openAIWebSocket != null) {
            openAIWebSocket.close(1000, "Client closed connection");
        }
    }
}
