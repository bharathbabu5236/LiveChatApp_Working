// LiveChatApp/screens/AgentChatScreen.js
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Platform, Alert } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { db, auth, appId } from '../firebaseConfig';
import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, doc, updateDoc } from 'firebase/firestore';

const AgentChatScreen = ({ route, navigation }) => {
    const { chatId, customerId } = route.params;
    const [messages, setMessages] = useState([]);
    const [inputText, setInputText] = useState('');
    const [chatStatus, setChatStatus] = useState('');
    const [showScrollButton, setShowScrollButton] = useState(false);
    const flatListRef = useRef(null);
    const currentAgentId = auth.currentUser?.uid;

    const handleScrollToBottom = () => {
        if (flatListRef.current) {
            flatListRef.current.scrollTop = flatListRef.current.scrollHeight;
        }
    };

    const handleScroll = (event) => {
        const { scrollTop, scrollHeight, clientHeight } = event.target;
        const isCloseToBottom = scrollTop + clientHeight >= scrollHeight - 20;
        setShowScrollButton(!isCloseToBottom);
    };

    useEffect(() => {
        if (!chatId) {
            console.error("Chat ID is missing for AgentChatScreen.");
            navigation.goBack();
            return;
        }

        // Listen for chat status changes
        const chatDocRef = doc(db, `artifacts/${appId}/public/data/chats`, chatId);
        const unsubscribeChatStatus = onSnapshot(chatDocRef, (docSnapshot) => {
            if (docSnapshot.exists()) {
                setChatStatus(docSnapshot.data().status);
            }
        }, (error) => {
            console.error("Error fetching chat status:", error);
        });

        // Listen for messages
        const messagesRef = collection(db, `artifacts/${appId}/public/data/chats/${chatId}/messages`);
        const q = query(messagesRef, orderBy('timestamp', 'asc'));

        const unsubscribeMessages = onSnapshot(q, (snapshot) => {
            const loadedMessages = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                timestamp: doc.data().timestamp?.toDate().toLocaleString(),
            }));
            setMessages(loadedMessages);
            // Scroll to bottom when new messages arrive
            if (flatListRef.current) {
                flatListRef.current.scrollToEnd({ animated: true });
            }
        }, (error) => {
            console.error("Error fetching messages:", error);
        });

        return () => {
            unsubscribeChatStatus();
            unsubscribeMessages(); // Cleanup both listeners on unmount
        };
    }, [chatId]);

    const handleSendMessage = async () => {
        if (inputText.trim() === '' || !chatId || !currentAgentId) return;
        if (chatStatus === 'closed') {
            Alert.alert("Chat Closed", "This chat has been closed and no new messages can be sent.");
            setInputText('');
            return;
        }

        try {
            const messagesRef = collection(db, `artifacts/${appId}/public/data/chats/${chatId}/messages`);
            await addDoc(messagesRef, {
                senderId: currentAgentId,
                senderType: 'agent',
                text: inputText,
                timestamp: serverTimestamp(),
            });
            setInputText('');

            // Update lastMessageAt in the chat document
            const chatDocRef = doc(db, `artifacts/${appId}/public/data/chats`, chatId);
            await updateDoc(chatDocRef, {
                lastMessageAt: serverTimestamp(),
            });

        } catch (error) {
            console.error("Error sending message:", error);
            Alert.alert("Error", "Failed to send message: " + error.message);
        }
    };

    const handleCloseChat = () => {
        console.log("Close button pressed. Navigating back to Agent Chats.");
        navigation.goBack();
    };

    const handleKeyPress = (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            handleSendMessage();
        }
        // Handle Shift+Enter (new line) - let it pass through naturally
        // No need to prevent default for Shift+Enter as it should create a new line
    };
  
    // Remove the old renderMessage function since we're using direct mapping now

    // Conditionally render department selection or chat interface
    if (!chatId) {
        return (
            <View style={styles.errorContainer}>
                <Text style={styles.errorText}>Chat ID is missing. Please go back and try again.</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Chat with User: {customerId?.substring(0, 8)}...</Text>
                <Text style={[styles.chatStatusText, chatStatus === 'closed' ? styles.statusClosed : styles.statusOpen]}>
                    Status: {chatStatus.charAt(0).toUpperCase() + chatStatus.slice(1)}
                </Text>
                <TouchableOpacity onPress={handleCloseChat} style={styles.closeChatButton}>
                    <MaterialIcons name="close" size={24} color="white" />
                    <Text style={styles.closeChatButtonText}>Close</Text>
                </TouchableOpacity>
            </View>

            <View style={styles.chatArea}>
                <div 
                    ref={flatListRef}
                    style={styles.messagesWrapper}
                    onScroll={handleScroll}
                >
                    <View style={styles.messagesList}>
                        {messages.length === 0 ? (
                            <View style={styles.emptyState}>
                                <Text style={styles.emptyStateText}>No messages yet. Start the conversation!</Text>
                            </View>
                        ) : (
                            messages.map(message => {
                                // Handle different message formats
                                let messageText = '';
                                if (message.senderId === currentAgentId) {
                                    // Agent's own messages use 'text' field
                                    messageText = message.text || 'Message content not available';
                                } else {
                                    // Customer messages - show translated English version to agent
                                    if (message.translatedTextEn) {
                                        messageText = message.translatedTextEn;
                                    } else if (message.originalText) {
                                        messageText = message.originalText;
                                    } else if (message.text) {
                                        messageText = message.text;
                                    } else {
                                        messageText = 'Message content not available';
                                    }
                                }

                                return (
                                    <View key={message.id} style={[
                                        styles.messageBubble,
                                        message.senderId === currentAgentId ? styles.myMessage : styles.otherMessage
                                    ]}>
                                        <Text style={styles.messageSender}>
                                            {message.senderId === currentAgentId ? 'You' : 'Customer'}
                                        </Text>
                                        <Text style={styles.messageText}>{messageText}</Text>
                                        <Text style={styles.messageTimestamp}>{message.timestamp}</Text>
                                    </View>
                                );
                            })
                        )}
                    </View>
                </div>

                {showScrollButton && (
                    <TouchableOpacity
                        style={styles.scrollToBottomButton}
                        onPress={handleScrollToBottom}
                    >
                        <MaterialIcons name="keyboard-arrow-down" size={24} color="white" />
                    </TouchableOpacity>
                )}
            </View>

            <View style={styles.inputContainer}>
                <TextInput
                    style={styles.textInput}
                    value={inputText}
                    onChangeText={setInputText}
                    placeholder={chatStatus === 'closed' ? "Chat is closed" : "Type your reply..."}
                    multiline
                    editable={chatStatus !== 'closed'}
                    onKeyPress={handleKeyPress}
                />
                <TouchableOpacity
                    style={[styles.sendButton, chatStatus === 'closed' && styles.sendButtonDisabled]}
                    onPress={handleSendMessage}
                    disabled={chatStatus === 'closed'}
                >
                    <MaterialIcons name="send" size={24} color="white" />
                </TouchableOpacity>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f0f4f8',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: '#3498db',
        padding: 15,
        paddingTop: Platform.OS === 'android' ? 40 : 15,
        borderBottomLeftRadius: 10,
        borderBottomRightRadius: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
        elevation: 5,
        height: 80,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: 'white',
        flexShrink: 1, // Allow text to shrink
        marginRight: 10,
    },
    chatStatusText: {
        fontSize: 14,
        fontWeight: 'bold',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 5,
    },
    statusOpen: {
        backgroundColor: '#2ecc71', // Green for open
        color: 'white',
    },
    statusClosed: {
        backgroundColor: '#e74c3c', // Red for closed
        color: 'white',
    },
    closeChatButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#e74c3c',
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 8,
        marginLeft: 10,
    },
    closeChatButtonText: {
        color: 'white',
        marginLeft: 5,
        fontWeight: 'bold',
    },
    messagesList: {
        paddingVertical: 10,
        paddingHorizontal: 10,
    },
    messageBubble: {
        maxWidth: '80%',
        padding: 10,
        borderRadius: 15,
        marginBottom: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 1,
    },
    myMessage: {
        alignSelf: 'flex-end',
        backgroundColor: '#dcf8c6', // Light green for agent's messages
        borderBottomRightRadius: 5,
    },
    otherMessage: {
        alignSelf: 'flex-start',
        backgroundColor: '#ffffff', // White for customer's messages
        borderBottomLeftRadius: 5,
    },
    messageSender: {
        fontSize: 11,
        fontWeight: 'bold',
        color: '#555',
        marginBottom: 3,
    },
    messageText: {
        fontSize: 16,
        color: '#333',
    },
    messageTimestamp: {
        fontSize: 10,
        color: '#777',
        alignSelf: 'flex-end',
        marginTop: 5,
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 10,
        borderTopWidth: 1,
        borderTopColor: '#e0e0e0',
        backgroundColor: '#fff',
        height: 70,
        minHeight: 70,
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
    },
    textInput: {
        flex: 1,
        backgroundColor: '#f9f9f9',
        borderRadius: 25,
        paddingHorizontal: 15,
        paddingVertical: 10,
        fontSize: 16,
        marginRight: 10,
        borderWidth: 1,
        borderColor: '#ddd',
    },
    sendButton: {
        backgroundColor: '#2ecc71',
        width: 45,
        height: 45,
        borderRadius: 22.5,
        justifyContent: 'center',
        alignItems: 'center',
    },
    sendButtonDisabled: {
        backgroundColor: '#a0a0a0', // Grey out when disabled
    },
    errorContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#f0f4f8',
    },
    errorText: {
        fontSize: 18,
        color: '#e74c3c',
        textAlign: 'center',
        padding: 20,
    },
    chatArea: {
        flex: 1,
        backgroundColor: '#f0f4f8',
    },
    messagesWrapper: {
        height: 'calc(100vh - 150px)',
        overflow: 'auto',
        backgroundColor: '#f0f4f8',
        ...(Platform.OS === 'web' && {
            WebkitOverflowScrolling: 'touch',
            scrollbarWidth: 'thin',
            scrollbarColor: '#3498db #f0f4f8',
        }),
    },
    emptyState: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    emptyStateText: {
        fontSize: 16,
        color: '#888',
        textAlign: 'center',
    },
    scrollToBottomButton: {
        position: 'absolute',
        bottom: 20,
        right: 20,
        backgroundColor: '#3498db',
        width: 50,
        height: 50,
        borderRadius: 25,
        justifyContent: 'center',
        alignItems: 'center',
        elevation: 5,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 3,
    },
});

export default AgentChatScreen;
