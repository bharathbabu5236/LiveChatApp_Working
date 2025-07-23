// LiveChatApp/screens/ChatPopup.js
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Platform, Alert, ActivityIndicator, Modal } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { db, auth, appId, authReadyPromise, signInAnonymously } from '../firebaseConfig';
import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, doc, updateDoc, getDocs, where } from 'firebase/firestore';

const ChatPopup = ({ visible, onClose, onAgentSelect }) => {
    const [messages, setMessages] = useState([]);
    const [inputText, setInputText] = useState('');
    const [userId, setUserId] = useState(null);
    const [chatId, setChatId] = useState(null);
    const [selectedDepartment, setSelectedDepartment] = useState(null);
    const [userType, setUserType] = useState(null); // 'customer' or 'agent'
    const [customerInfo, setCustomerInfo] = useState({ name: '', phone: '' });
    const [botStep, setBotStep] = useState('welcome'); // 'welcome', 'askName', 'askPhone', 'showAgentOption'
    const [loadingChatSetup, setLoadingChatSetup] = useState(false);
    const [showScrollButton, setShowScrollButton] = useState(false);
    const [isMinimized, setIsMinimized] = useState(false);
    const flatListRef = useRef(null);

    // Agent UIDs - replace with actual UIDs from Firebase Authentication
    const AGENT_DOCTOR_UID = 'UVGDfqIPKYVblK3OhRfenFa0BVp2';
    const AGENT_PAYMENTS_UID = 'WF7Q4sW6gnMqRRe2KT3igD4yEKn2';

    useEffect(() => {
        if (visible && !userType) {
            // Reset state when popup opens
            setMessages([]);
            setInputText('');
            setChatId(null);
            setUserId(null);
            setSelectedDepartment(null);
            setCustomerInfo({ name: '', phone: '' });
            setBotStep('welcome');
        }
    }, [visible]);

    useEffect(() => {
        if (userType === 'agent') {
            // Close popup and call the callback to handle agent navigation
            onClose();
            if (onAgentSelect) {
                onAgentSelect();
            }
        } else if (userType === 'customer') {
            // Start the AI bot conversation
            setBotStep('askName');
        }
    }, [userType, onClose, onAgentSelect]);

    useEffect(() => {
        const setupChat = async () => {
            if (!selectedDepartment) return;
            
            console.log("ChatPopup: Setting up chat...");
            setLoadingChatSetup(true);

            await authReadyPromise;

            let currentUser = auth.currentUser;
            if (!currentUser || (currentUser.isAnonymous === false && currentUser.email)) {
                try {
                    console.log("ChatPopup: Signing in anonymously for customer...");
                    await signInAnonymously(auth);
                    currentUser = auth.currentUser;
                    console.log("ChatPopup: Anonymous user signed in:", currentUser.uid);
                } catch (error) {
                    console.error("ChatPopup: Error signing in anonymously:", error);
                    Alert.alert("Error", "Failed to connect to chat services. Please try again later.");
                    setLoadingChatSetup(false);
                    return;
                }
            }

            if (currentUser) {
                setUserId(currentUser.uid);
                console.log("ChatPopup: Customer User ID set:", currentUser.uid);

                const chatsRef = collection(db, `artifacts/${appId}/public/data/chats`);
                let assignedAgentId = null;

                if (selectedDepartment === 'doctor') {
                    assignedAgentId = AGENT_DOCTOR_UID;
                } else if (selectedDepartment === 'payments') {
                    assignedAgentId = AGENT_PAYMENTS_UID;
                }

                if (!assignedAgentId || assignedAgentId.startsWith('YOUR_AGENT')) {
                    console.error("ChatPopup: Assigned agent UID is missing or is a placeholder for selected department:", selectedDepartment);
                    Alert.alert("Configuration Error", "Agent for this department is not configured. Please contact support.");
                    setLoadingChatSetup(false);
                    return;
                }

                const q = query(
                    chatsRef,
                    where('userId', '==', currentUser.uid),
                    where('status', '==', 'open'),
                    where('assignedDepartment', '==', selectedDepartment),
                    orderBy('createdAt', 'desc')
                );

                let foundChatId = null;
                try {
                    const querySnapshot = await getDocs(q);
                    if (!querySnapshot.empty) {
                        foundChatId = querySnapshot.docs[0].id;
                        console.log("ChatPopup: Found existing open chat for this user/department:", foundChatId);
                    }
                } catch (error) {
                    console.error("ChatPopup: Error searching for existing chats:", error);
                }

                if (foundChatId) {
                    setChatId(foundChatId);
                    console.log("ChatPopup: Joined existing chat with ID:", foundChatId);
                } else {
                    console.log("ChatPopup: No open chat found for this department, creating a new one...");
                    if (!selectedDepartment) {
                        console.warn("ChatPopup: No department selected, cannot create chat.");
                        setLoadingChatSetup(false);
                        return;
                    }

                    const newChatRef = await addDoc(chatsRef, {
                        userId: currentUser.uid,
                        agentId: assignedAgentId,
                        status: 'open',
                        assignedDepartment: selectedDepartment,
                        createdAt: serverTimestamp(),
                        lastMessageAt: serverTimestamp(),
                    });
                    setChatId(newChatRef.id);
                    console.log("ChatPopup: Created new chat with ID:", newChatRef.id);
                }
            } else {
                console.error("ChatPopup: User not authenticated after setup attempt.");
                Alert.alert("Authentication Error", "Could not authenticate. Please restart the app.");
            }
            setLoadingChatSetup(false);
        };

        if (selectedDepartment) {
            setupChat();
        }
    }, [selectedDepartment]);

    useEffect(() => {
        if (chatId) {
            console.log("ChatPopup: Listening for messages in chat:", chatId);
            const messagesRef = collection(db, `artifacts/${appId}/public/data/chats/${chatId}/messages`);
            const q = query(messagesRef, orderBy('timestamp', 'asc'));

            const unsubscribeMessages = onSnapshot(q, (snapshot) => {
                const loadedMessages = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data(),
                    timestamp: doc.data().timestamp?.toDate().toLocaleString(),
                }));
                setMessages(loadedMessages);
                console.log("ChatPopup: Messages loaded:", loadedMessages.length);
            }, (error) => {
                console.error("ChatPopup: Error fetching messages:", error);
            });

            return () => {
                console.log("ChatPopup: Unsubscribing from messages for chat:", chatId);
                unsubscribeMessages();
            };
        }
    }, [chatId]);

    const handleSendMessage = async () => {
        console.log("ChatPopup: Send button pressed.");
        console.log("ChatPopup: Input Text:", inputText.trim());
        console.log("ChatPopup: Current Chat ID:", chatId);
        console.log("ChatPopup: Current User ID:", userId);

        if (inputText.trim() === '' || !chatId || !userId) {
            console.warn("ChatPopup: Cannot send message: Input empty, chatId or userId missing.");
            return;
        }

        try {
            const messagesRef = collection(db, `artifacts/${appId}/public/data/chats/${chatId}/messages`);
            await addDoc(messagesRef, {
                senderId: userId,
                senderType: 'user',
                text: inputText,
                timestamp: serverTimestamp(),
            });
            setInputText('');
            console.log("ChatPopup: Message sent successfully!");

            const chatDocRef = doc(db, `artifacts/${appId}/public/data/chats`, chatId);
            await updateDoc(chatDocRef, {
                lastMessageAt: serverTimestamp(),
            });
            console.log("ChatPopup: Chat lastMessageAt updated.");

        } catch (error) {
            console.error("ChatPopup: Error sending message:", error);
            Alert.alert("Error", "Failed to send message: " + error.message);
        }
    };

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

    const toggleMinimize = () => {
        setIsMinimized(!isMinimized);
    };

    const handleBotInput = () => {
        if (inputText.trim() === '') return;

        if (botStep === 'askName') {
            setCustomerInfo(prev => ({ ...prev, name: inputText.trim() }));
            setBotStep('askPhone');
            setInputText('');
        } else if (botStep === 'askPhone') {
            setCustomerInfo(prev => ({ ...prev, phone: inputText.trim() }));
            setBotStep('showAgentOption');
            setInputText('');
        }
    };

    const handleKeyPress = (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            if (botStep === 'askName' || botStep === 'askPhone') {
                handleBotInput();
            } else if (selectedDepartment) {
                handleSendMessage();
            }
        }
    };

    const handleSpeakToAgent = () => {
        console.log('Speak to Agent button pressed');
        console.log('Current botStep:', botStep);
        setBotStep('departmentSelection');
        console.log('BotStep set to departmentSelection');
    };

    if (!visible) return null;

    // User type selection view
    if (!userType) {
        return (
            <View style={styles.popupContainer}>
                <View style={styles.popupHeader}>
                    <View style={styles.headerContent}>
                        <MaterialIcons name="smart-toy" size={24} color="#3498db" />
                        <View style={styles.headerTextContainer}>
                            <Text style={styles.headerTitle}>Welcome to HealthBuddy</Text>
                            <Text style={styles.headerSubtitle}>Our bot guide can help you through the process.</Text>
                        </View>
                    </View>
                    <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                        <MaterialIcons name="close" size={20} color="#666" />
                    </TouchableOpacity>
                </View>
                
                <View style={styles.popupBody}>
                    <Text style={styles.instructionText}>
                        Hi! Please select your role to start chatting.
                    </Text>
                    
                    <TouchableOpacity
                        style={styles.departmentButton}
                        onPress={() => setUserType('customer')}
                    >
                        <MaterialIcons name="person" size={20} color="white" />
                        <Text style={styles.departmentButtonText}>I'm a Customer</Text>
                    </TouchableOpacity>
                    
                    <TouchableOpacity
                        style={[styles.departmentButton, styles.agentButton]}
                        onPress={() => setUserType('agent')}
                    >
                        <MaterialIcons name="support-agent" size={20} color="white" />
                        <Text style={styles.departmentButtonText}>I'm an Agent</Text>
                    </TouchableOpacity>
                </View>
                
                <View style={styles.popupFooter}>
                    <Text style={styles.footerText}>Powered By AI</Text>
                </View>
            </View>
        );
    }

    // Bot conversation views for customers
    if (userType === 'customer' && botStep !== 'departmentSelection') {
        return (
            <View style={styles.popupContainer}>
                <View style={styles.popupHeader}>
                    <View style={styles.headerContent}>
                        <MaterialIcons name="smart-toy" size={24} color="#3498db" />
                        <View style={styles.headerTextContainer}>
                            <Text style={styles.headerTitle}>AI Assistant</Text>
                            <Text style={styles.headerSubtitle}>Collecting your information</Text>
                        </View>
                    </View>
                    <TouchableOpacity onPress={() => setUserType(null)} style={styles.backButton}>
                        <MaterialIcons name="arrow-back" size={20} color="#666" />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                        <MaterialIcons name="close" size={20} color="#666" />
                    </TouchableOpacity>
                </View>
                
                <View style={styles.popupBody}>
                    <View style={styles.botMessages}>
                        {botStep === 'askName' && (
                            <View style={styles.botMessage}>
                                <MaterialIcons name="smart-toy" size={20} color="#3498db" />
                                <Text style={styles.botMessageText}>Hello! I'm your AI assistant. What's your name?</Text>
                            </View>
                        )}
                        
                        {botStep === 'askPhone' && (
                            <>
                                <View style={styles.botMessage}>
                                    <MaterialIcons name="smart-toy" size={20} color="#3498db" />
                                    <Text style={styles.botMessageText}>Hello! I'm your AI assistant. What's your name?</Text>
                                </View>
                                <View style={styles.userMessage}>
                                    <Text style={styles.userMessageText}>{customerInfo.name}</Text>
                                </View>
                                <View style={styles.botMessage}>
                                    <MaterialIcons name="smart-toy" size={20} color="#3498db" />
                                    <Text style={styles.botMessageText}>Nice to meet you, {customerInfo.name}! What's your phone number?</Text>
                                </View>
                            </>
                        )}
                        
                        {botStep === 'showAgentOption' && (
                            <>
                                <View style={styles.botMessage}>
                                    <MaterialIcons name="smart-toy" size={20} color="#3498db" />
                                    <Text style={styles.botMessageText}>Hello! I'm your AI assistant. What's your name?</Text>
                                </View>
                                <View style={styles.userMessage}>
                                    <Text style={styles.userMessageText}>{customerInfo.name}</Text>
                                </View>
                                <View style={styles.botMessage}>
                                    <MaterialIcons name="smart-toy" size={20} color="#3498db" />
                                    <Text style={styles.botMessageText}>Nice to meet you, {customerInfo.name}! What's your phone number?</Text>
                                </View>
                                <View style={styles.userMessage}>
                                    <Text style={styles.userMessageText}>{customerInfo.phone}</Text>
                                </View>
                                <View style={styles.botMessage}>
                                    <MaterialIcons name="smart-toy" size={20} color="#3498db" />
                                    <Text style={styles.botMessageText}>Thank you! I have your information. Would you like to speak with a live agent?</Text>
                                </View>
                            </>
                        )}
                    </View>
                    
                    {botStep === 'showAgentOption' && (
                        <View style={styles.agentButtonContainer}>
                            <TouchableOpacity
                                style={styles.speakToAgentButton}
                                onPress={handleSpeakToAgent}
                                activeOpacity={0.7}
                            >
                                <MaterialIcons name="support-agent" size={20} color="white" />
                                <Text style={styles.speakToAgentButtonText}>Speak to an Agent</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                </View>
                
                {(botStep === 'askName' || botStep === 'askPhone') && (
                    <View style={styles.inputContainer}>
                        <TextInput
                            style={styles.textInput}
                            value={inputText}
                            onChangeText={setInputText}
                            placeholder={botStep === 'askName' ? "Enter your name..." : "Enter your phone number..."}
                            multiline
                            onKeyPress={handleKeyPress}
                        />
                        <TouchableOpacity style={styles.sendButton} onPress={handleBotInput}>
                            <MaterialIcons name="send" size={16} color="white" />
                        </TouchableOpacity>
                    </View>
                )}
                
                <View style={styles.popupFooter}>
                    <Text style={styles.footerText}>Powered By AI</Text>
                </View>
            </View>
        );
    }

    // Department selection view (only for customers after bot conversation)
    if (userType === 'customer' && botStep === 'departmentSelection' && !selectedDepartment) {
        return (
            <View style={styles.popupContainer}>
                <View style={styles.popupHeader}>
                    <View style={styles.headerContent}>
                        <MaterialIcons name="smart-toy" size={24} color="#3498db" />
                        <View style={styles.headerTextContainer}>
                            <Text style={styles.headerTitle}>Welcome to HealthBuddy</Text>
                            <Text style={styles.headerSubtitle}>Our bot guide can help you through the process.</Text>
                        </View>
                    </View>
                    <TouchableOpacity onPress={() => setBotStep('showAgentOption')} style={styles.backButton}>
                        <MaterialIcons name="arrow-back" size={20} color="#666" />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                        <MaterialIcons name="close" size={20} color="#666" />
                    </TouchableOpacity>
                </View>
                
                <View style={styles.popupBody}>
                    <Text style={styles.instructionText}>
                        Hi {customerInfo.name}! Please select a department to start chatting with the next available agent.
                    </Text>
                    
                    <TouchableOpacity
                        style={styles.departmentButton}
                        onPress={() => setSelectedDepartment('doctor')}
                    >
                        <MaterialIcons name="local-hospital" size={20} color="white" />
                        <Text style={styles.departmentButtonText}>Doctor Department</Text>
                    </TouchableOpacity>
                    
                    <TouchableOpacity
                        style={[styles.departmentButton, styles.paymentsButton]}
                        onPress={() => setSelectedDepartment('payments')}
                    >
                        <MaterialIcons name="payment" size={20} color="white" />
                        <Text style={styles.departmentButtonText}>Payments Department</Text>
                    </TouchableOpacity>
                </View>
                
                <View style={styles.popupFooter}>
                    <Text style={styles.footerText}>Powered By AI</Text>
                </View>
            </View>
        );
    }

    // Minimized view
    if (isMinimized) {
        return (
            <View style={styles.minimizedContainer}>
                <TouchableOpacity onPress={toggleMinimize} style={styles.minimizedButton}>
                    <MaterialIcons name="chat" size={24} color="white" />
                    <Text style={styles.minimizedText}>Chat</Text>
                </TouchableOpacity>
            </View>
        );
    }

    // Full chat view (only for customers with selected department)
    if (userType === 'customer' && selectedDepartment) {
        return (
            <View style={styles.popupContainer}>
                <View style={styles.popupHeader}>
                    <View style={styles.headerContent}>
                        <MaterialIcons name="smart-toy" size={24} color="#3498db" />
                        <View style={styles.headerTextContainer}>
                            <Text style={styles.headerTitle}>Live Chat - {selectedDepartment.toUpperCase()}</Text>
                            <Text style={styles.headerSubtitle}>Connected to agent</Text>
                        </View>
                    </View>
                <View style={styles.headerButtons}>
                    <TouchableOpacity onPress={toggleMinimize} style={styles.minimizeButton}>
                        <MaterialIcons name="remove" size={20} color="#666" />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                        <MaterialIcons name="close" size={20} color="#666" />
                    </TouchableOpacity>
                </View>
            </View>

            <View style={styles.popupBody}>
                {loadingChatSetup ? (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="small" color="#3498db" />
                        <Text style={styles.loadingText}>Connecting to chat...</Text>
                    </View>
                ) : (
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
                                messages.map(message => (
                                    <View key={message.id} style={[
                                        styles.messageBubble,
                                        message.senderId === userId ? styles.myMessage : styles.otherMessage
                                    ]}>
                                        <Text style={styles.messageText}>{message.text}</Text>
                                        <Text style={styles.messageTimestamp}>{message.timestamp}</Text>
                                    </View>
                                ))
                            )}
                        </View>
                    </div>
                )}

                {showScrollButton && (
                    <TouchableOpacity
                        style={styles.scrollToBottomButton}
                        onPress={handleScrollToBottom}
                    >
                        <MaterialIcons name="keyboard-arrow-down" size={16} color="white" />
                    </TouchableOpacity>
                )}
            </View>

            <View style={styles.inputContainer}>
                <TextInput
                    style={styles.textInput}
                    value={inputText}
                    onChangeText={setInputText}
                    placeholder="Type your message..."
                    multiline
                    onKeyPress={handleKeyPress}
                />
                <TouchableOpacity style={styles.sendButton} onPress={handleSendMessage}>
                    <MaterialIcons name="send" size={16} color="white" />
                </TouchableOpacity>
            </View>
        </View>
    );
    }

    // If we reach here, something went wrong - return null
    return null;
};

const styles = StyleSheet.create({
    popupContainer: {
        position: 'absolute',
        bottom: 20,
        right: 20,
        width: 350,
        height: 500,
        backgroundColor: 'white',
        borderRadius: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 10,
        zIndex: 1000,
        overflow: 'hidden',
    },
    minimizedContainer: {
        position: 'absolute',
        bottom: 20,
        right: 20,
        zIndex: 1000,
    },
    minimizedButton: {
        backgroundColor: '#3498db',
        width: 60,
        height: 60,
        borderRadius: 30,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
        elevation: 5,
    },
    minimizedText: {
        color: 'white',
        fontSize: 10,
        marginTop: 2,
    },
    popupHeader: {
        backgroundColor: '#f8f9fa',
        padding: 15,
        borderBottomWidth: 1,
        borderBottomColor: '#e9ecef',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    headerContent: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    headerTextContainer: {
        marginLeft: 10,
        flex: 1,
    },
    headerTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#2c3e50',
    },
    headerSubtitle: {
        fontSize: 12,
        color: '#6c757d',
        marginTop: 2,
    },
    headerButtons: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    minimizeButton: {
        padding: 5,
        marginRight: 5,
    },
    closeButton: {
        padding: 5,
    },
    popupBody: {
        flex: 1,
        backgroundColor: '#f8f9fa',
        position: 'relative',
    },
    instructionText: {
        fontSize: 14,
        color: '#495057',
        textAlign: 'center',
        padding: 20,
        lineHeight: 20,
    },
    departmentButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#3498db',
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderRadius: 8,
        marginHorizontal: 20,
        marginBottom: 10,
        justifyContent: 'center',
    },
    paymentsButton: {
        backgroundColor: '#9b59b6',
    },
    agentButton: {
        backgroundColor: '#e74c3c',
    },
    departmentButtonText: {
        color: 'white',
        fontSize: 14,
        fontWeight: 'bold',
        marginLeft: 8,
    },
    backButton: {
        padding: 5,
        marginRight: 5,
    },
    botMessages: {
        padding: 15,
        flex: 1,
    },
    botMessage: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: 15,
        backgroundColor: '#f8f9fa',
        padding: 12,
        borderRadius: 12,
        borderBottomLeftRadius: 4,
    },
    botMessageText: {
        fontSize: 14,
        color: '#2c3e50',
        marginLeft: 8,
        flex: 1,
        lineHeight: 20,
    },
    userMessage: {
        alignSelf: 'flex-end',
        backgroundColor: '#3498db',
        padding: 12,
        borderRadius: 12,
        borderBottomRightRadius: 4,
        marginBottom: 15,
        maxWidth: '80%',
    },
    userMessageText: {
        fontSize: 14,
        color: 'white',
        lineHeight: 20,
    },
    speakToAgentButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#2ecc71',
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderRadius: 8,
        marginTop: 10,
        justifyContent: 'center',
        alignSelf: 'flex-start',
    },
    speakToAgentButtonText: {
        color: 'white',
        fontSize: 14,
        fontWeight: 'bold',
        marginLeft: 8,
    },
    agentButtonContainer: {
        padding: 15,
        borderTopWidth: 1,
        borderTopColor: '#e9ecef',
        backgroundColor: '#fff',
    },
    popupFooter: {
        padding: 10,
        borderTopWidth: 1,
        borderTopColor: '#e9ecef',
        alignItems: 'center',
    },
    footerText: {
        fontSize: 12,
        color: '#6c757d',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        marginTop: 10,
        fontSize: 14,
        color: '#6c757d',
    },
    messagesWrapper: {
        height: '100%',
        overflow: 'auto',
        backgroundColor: '#f8f9fa',
        ...(Platform.OS === 'web' && {
            WebkitOverflowScrolling: 'touch',
            scrollbarWidth: 'thin',
            scrollbarColor: '#3498db #f8f9fa',
        }),
    },
    messagesList: {
        padding: 10,
    },
    messageBubble: {
        maxWidth: '80%',
        padding: 8,
        borderRadius: 12,
        marginBottom: 8,
        elevation: 1,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
    },
    myMessage: {
        alignSelf: 'flex-end',
        backgroundColor: '#dcf8c6',
        borderBottomRightRadius: 4,
    },
    otherMessage: {
        alignSelf: 'flex-start',
        backgroundColor: '#ffffff',
        borderBottomLeftRadius: 4,
    },
    messageText: {
        fontSize: 14,
        color: '#333',
    },
    messageTimestamp: {
        fontSize: 10,
        color: '#777',
        alignSelf: 'flex-end',
        marginTop: 4,
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 10,
        borderTopWidth: 1,
        borderTopColor: '#e9ecef',
        backgroundColor: '#fff',
    },
    textInput: {
        flex: 1,
        backgroundColor: '#f8f9fa',
        borderRadius: 20,
        paddingHorizontal: 12,
        paddingVertical: 8,
        fontSize: 14,
        marginRight: 8,
        borderWidth: 1,
        borderColor: '#e9ecef',
        maxHeight: 80,
    },
    sendButton: {
        backgroundColor: '#2ecc71',
        width: 32,
        height: 32,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
    },
    scrollToBottomButton: {
        position: 'absolute',
        bottom: 10,
        right: 10,
        backgroundColor: '#3498db',
        width: 30,
        height: 30,
        borderRadius: 15,
        justifyContent: 'center',
        alignItems: 'center',
        elevation: 3,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.2,
        shadowRadius: 2,
    },
    emptyState: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    emptyStateText: {
        fontSize: 14,
        color: '#6c757d',
        textAlign: 'center',
    },
});

export default ChatPopup; 