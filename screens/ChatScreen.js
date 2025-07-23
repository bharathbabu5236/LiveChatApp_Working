// LiveChatApp/screens/ChatScreen.js
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Platform, Alert, ActivityIndicator } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { db, auth, appId, authReadyPromise, signInAnonymously } from '../firebaseConfig';
import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, doc, updateDoc, getDocs, where } from 'firebase/firestore';

const ChatScreen = () => {
    const [messages, setMessages] = useState([]);
    const [inputText, setInputText] = useState('');
    const [userId, setUserId] = useState(null);
    const [chatId, setChatId] = useState(null);
    const [selectedDepartment, setSelectedDepartment] = useState(null); // New state for department
    const [loadingChatSetup, setLoadingChatSetup] = useState(false); // New state for loading indicator
    const [showScrollButton, setShowScrollButton] = useState(false);
    const flatListRef = useRef(null);

    // --- IMPORTANT: Replace these with the actual UIDs of your agents from Firebase Authentication ---
    // You can find these UIDs in your Firebase Console -> Authentication -> Users tab.
    const AGENT_DOCTOR_UID = 'UVGDfqIPKYVblK3OhRfenFa0BVp2'; // Doctor's UID
    const AGENT_PAYMENTS_UID = 'WF7Q4sW6gnMqRRe2KT3igD4yEKn2'; // Payments' UID
    // Make sure these are actual UIDs, not the placeholder strings!
    // ------------------------------------------------------------------------------------------------

    useEffect(() => {
        const setupChat = async () => {
            console.log("ChatScreen: Setting up chat...");
            setLoadingChatSetup(true); // Start loading

            await authReadyPromise; // Ensure authentication service is ready

            let currentUser = auth.currentUser;
            // Ensure customer is signed in anonymously if not already or if it's an agent
            if (!currentUser || (currentUser.isAnonymous === false && currentUser.email)) {
                try {
                    console.log("ChatScreen: Signing in anonymously for customer...");
                    await signInAnonymously(auth);
                    currentUser = auth.currentUser; // Get the newly signed-in anonymous user
                    console.log("ChatScreen: Anonymous user signed in:", currentUser.uid);
                } catch (error) {
                    console.error("ChatScreen: Error signing in anonymously:", error);
                    Alert.alert("Error", "Failed to connect to chat services. Please try again later.");
                    setLoadingChatSetup(false);
                    return;
                }
            }

            if (currentUser) {
                setUserId(currentUser.uid);
                console.log("ChatScreen: Customer User ID set:", currentUser.uid);

                const chatsRef = collection(db, `artifacts/${appId}/public/data/chats`);
                let assignedAgentId = null;

                if (selectedDepartment === 'doctor') {
                    assignedAgentId = AGENT_DOCTOR_UID;
                } else if (selectedDepartment === 'payments') {
                    assignedAgentId = AGENT_PAYMENTS_UID;
                }

                // Check if assignedAgentId is valid before proceeding
                if (!assignedAgentId || assignedAgentId.startsWith('YOUR_AGENT')) {
                    console.error("ChatScreen: Assigned agent UID is missing or is a placeholder for selected department:", selectedDepartment);
                    Alert.alert("Configuration Error", "Agent for this department is not configured. Please contact support.");
                    setLoadingChatSetup(false);
                    return;
                }


                // Query for existing open chats by this user AND for this department/agent
                const q = query(
                    chatsRef,
                    where('userId', '==', currentUser.uid),
                    where('status', '==', 'open'),
                    where('assignedDepartment', '==', selectedDepartment), // New: Filter by department
                    orderBy('createdAt', 'desc')
                );

                let foundChatId = null;
                try {
                    const querySnapshot = await getDocs(q);
                    if (!querySnapshot.empty) {
                        foundChatId = querySnapshot.docs[0].id; // Get the most recent open chat for this user/department
                        console.log("ChatScreen: Found existing open chat for this user/department:", foundChatId);
                    }
                } catch (error) {
                    console.error("ChatScreen: Error searching for existing chats:", error);
                }

                if (foundChatId) {
                    setChatId(foundChatId);
                    console.log("ChatScreen: Joined existing chat with ID:", foundChatId);
                } else {
                    console.log("ChatScreen: No open chat found for this department, creating a new one...");
                    if (!selectedDepartment) {
                        console.warn("ChatScreen: No department selected, cannot create chat.");
                        setLoadingChatSetup(false);
                        return;
                    }
                    // The assignedAgentId check is now at the top of this block
                    

                    const newChatRef = await addDoc(chatsRef, {
                        userId: currentUser.uid,
                        agentId: assignedAgentId, // Assign agent based on department
                        status: 'open',
                        assignedDepartment: selectedDepartment, // Store the selected department
                        createdAt: serverTimestamp(),
                        lastMessageAt: serverTimestamp(),
                    });
                    setChatId(newChatRef.id);
                    console.log("ChatScreen: Created new chat with ID:", newChatRef.id);
                }
            } else {
                console.error("ChatScreen: User not authenticated after setup attempt.");
                Alert.alert("Authentication Error", "Could not authenticate. Please restart the app.");
            }
            setLoadingChatSetup(false); // End loading
        };

        // Only run setupChat if a department has been selected
        if (selectedDepartment) {
            setupChat();
        }
    }, [selectedDepartment]); // Re-run when selectedDepartment changes

    useEffect(() => {
        if (chatId) {
            console.log("ChatScreen: Listening for messages in chat:", chatId);
            const messagesRef = collection(db, `artifacts/${appId}/public/data/chats/${chatId}/messages`);
            const q = query(messagesRef, orderBy('timestamp', 'asc'));

            const unsubscribeMessages = onSnapshot(q, (snapshot) => {
                const loadedMessages = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data(),
                    timestamp: doc.data().timestamp?.toDate().toLocaleString(), // Convert Firestore Timestamp to readable string
                }));
                setMessages(loadedMessages);
                console.log("ChatScreen: Messages loaded:", loadedMessages.length);
                if (flatListRef.current) {
                    // The original code had flatListRef.current.scrollToEnd({ animated: true });
                    // This line is removed as per the edit hint to remove debug button.
                    // The scrollToEnd functionality is now handled by the div's onScroll event.
                }
            }, (error) => {
                console.error("ChatScreen: Error fetching messages:", error);
            });

            return () => {
                console.log("ChatScreen: Unsubscribing from messages for chat:", chatId);
                unsubscribeMessages();
            };
        }
    }, [chatId]);

    const handleSendMessage = async () => {
        console.log("ChatScreen: Send button pressed.");
        console.log("ChatScreen: Input Text:", inputText.trim());
        console.log("ChatScreen: Current Chat ID:", chatId);
        console.log("ChatScreen: Current User ID:", userId);

        if (inputText.trim() === '' || !chatId || !userId) {
            console.warn("ChatScreen: Cannot send message: Input empty, chatId or userId missing.");
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
            console.log("ChatScreen: Message sent successfully!");

            const chatDocRef = doc(db, `artifacts/${appId}/public/data/chats`, chatId);
            await updateDoc(chatDocRef, {
                lastMessageAt: serverTimestamp(),
            });
            console.log("ChatScreen: Chat lastMessageAt updated.");

        } catch (error) {
            console.error("ChatScreen: Error sending message:", error);
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

    const handleKeyPress = (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            handleSendMessage();
        }
    };

    // Conditionally render department selection or chat interface
    if (!selectedDepartment) {
        return (
            <View style={styles.departmentSelectionContainer}>
                <Text style={styles.departmentTitle}>How can we help you today?</Text>
                <TouchableOpacity
                    style={styles.departmentButton}
                    onPress={() => setSelectedDepartment('doctor')}
                >
                    <MaterialIcons name="local-hospital" size={30} color="white" />
                    <Text style={styles.departmentButtonText}>Doctor Department</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.departmentButton, styles.paymentsButton]}
                    onPress={() => setSelectedDepartment('payments')}
                >
                    <MaterialIcons name="payment" size={30} color="white" />
                    <Text style={styles.departmentButtonText}>Payments Department</Text>
                </TouchableOpacity>
            </View>
        );
    }

    if (loadingChatSetup) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#3498db" />
                <Text style={styles.loadingText}>Connecting to chat...</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.headerText}>Live Chat - {selectedDepartment.toUpperCase()}</Text>
                {userId && <Text style={styles.userIdText}>Your ID: {userId}</Text>}
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
                    placeholder="Type your message..."
                    multiline
                    onKeyPress={handleKeyPress}
                />
                <TouchableOpacity style={styles.sendButton} onPress={handleSendMessage}>
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
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#f0f4f8',
    },
    loadingText: {
        marginTop: 10,
        fontSize: 16,
        color: '#555',
    },
    header: {
        padding: 15,
        backgroundColor: '#3498db',
        alignItems: 'center',
        justifyContent: 'center',
        borderBottomLeftRadius: 10,
        borderBottomRightRadius: 10,
        elevation: 3,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 3,
        height: 80,
    },
    headerText: {
        fontSize: 20,
        fontWeight: 'bold',
        color: 'white',
    },
    userIdText: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.7)',
        marginTop: 5,
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
    messagesList: {
        paddingVertical: 10,
        paddingHorizontal: 10,
        paddingBottom: 20,
    },
    messagesContainer: {
        flex: 1,
        backgroundColor: '#f0f4f8',
    },
    messageBubble: {
        maxWidth: '80%',
        padding: 10,
        borderRadius: 15,
        marginBottom: 10,
        elevation: 1,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
    },
    myMessage: {
        alignSelf: 'flex-end',
        backgroundColor: '#dcf8c6',
        borderBottomRightRadius: 5,
    },
    otherMessage: {
        alignSelf: 'flex-start',
        backgroundColor: '#ffffff',
        borderBottomLeftRadius: 5,
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
    // New styles for department selection
    departmentSelectionContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#f0f4f8',
        padding: 20,
    },
    departmentTitle: {
        fontSize: 24,
        fontWeight: 'bold',
        marginBottom: 40,
        textAlign: 'center',
        color: '#2c3e50',
    },
    departmentButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#3498db', // Blue for Doctor
        paddingVertical: 15,
        paddingHorizontal: 30,
        borderRadius: 10,
        width: '80%',
        maxWidth: 300,
        justifyContent: 'center',
        marginBottom: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
        elevation: 5,
    },
    paymentsButton: {
        backgroundColor: '#9b59b6', // Purple for Payments
    },
    departmentButtonText: {
        color: 'white',
        fontSize: 18,
        fontWeight: 'bold',
        marginLeft: 10,
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
    emptyState: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    emptyStateText: {
        fontSize: 18,
        color: '#555',
        textAlign: 'center',
    },
});

export default ChatScreen;
