package org.example.config;

import org.example.wep.RealTimeSpeechHandler;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

@Configuration
@EnableWebSocket
public class WebSocketConfig implements WebSocketConfigurer {

    private final RealTimeSpeechHandler realTimeSpeechHandler;

    // Autowires the RealTimeSpeechHandler instance into the class
    @Autowired
    public WebSocketConfig(RealTimeSpeechHandler realTimeSpeechHandler) {
        this.realTimeSpeechHandler = realTimeSpeechHandler;
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        // Registers the RealTimeSpeechHandler to handle WebSocket requests on the "/api/realtime-api" endpoint
        // Allows connections from all origins
        registry.addHandler(realTimeSpeechHandler, "/api/realtime-api").setAllowedOrigins("*");
    }
}