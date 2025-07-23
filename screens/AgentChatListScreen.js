// LiveChatApp/screens/AgentChatListScreen.js
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Platform, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { auth, db, appId, signOut } from '../firebaseConfig';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, where } from 'firebase/firestore';
import { MaterialIcons } from '@expo/vector-icons'; // Added MaterialIcons import

const AgentChatListScreen = () => {
    const [chats, setChats] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const navigation = useNavigation();
    const currentAgentId = auth.currentUser?.uid;
    const currentAgentEmail = auth.currentUser?.email;



    const AGENT_DEPARTMENT_MAP = {
        'UVGDfqIPKYVblK3OhRfenFa0BVp2': 'doctor', // Doctor Agent's UID
        'WF7Q4sW6gnMqRRe2KT3igD4yEKn2': 'payments', // Payments Agent's UID
    };

    const currentAgentDepartment = AGENT_DEPARTMENT_MAP[currentAgentId];

    useEffect(() => {
        if (!currentAgentId) {
            navigation.replace('Login');
            return;
        }

        if (!currentAgentDepartment) {
            console.error("Agent's department not configured or found for UID:", currentAgentId);
            setLoading(false);
            Alert.alert("Configuration Error", "Your agent account is not assigned to a department. Please contact administrator.");
            return;
        }

        const chatsRef = collection(db, `artifacts/${appId}/public/data/chats`);
        
        const q = query(
            chatsRef,
            where('assignedDepartment', '==', currentAgentDepartment),
            where('status', '==', 'open'),
            orderBy('createdAt', 'desc')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const loadedChats = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                lastMessageAt: doc.data().lastMessageAt?.toDate(),
            }));
            console.log('AgentChatListScreen: Loaded chats:', loadedChats.length);
            setChats(loadedChats);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching chats for agent's department:", error);
            setLoading(false);
            Alert.alert("Error", "Failed to load chats: " + error.message);
        });

        return unsubscribe;
    }, [currentAgentId, currentAgentDepartment]);

    const handleLogout = async () => {
        try {
            await signOut(auth);
            navigation.replace('InitialChoice');
        } catch (error) {
            console.error("Logout failed:", error.message);
            Alert.alert("Logout Error", "Failed to log out: " + error.message);
        }
    };

    const onRefresh = () => {
        setRefreshing(true);
        // The useEffect will automatically refresh the data
        // We just need to set refreshing to false after a short delay
        setTimeout(() => setRefreshing(false), 1000);
    };

    const renderChatItem = ({ item }) => {
        let statusText = '';
        let statusColor = '';
        let chatBgColor = '#f8f8f8';

        if (item.status === 'open' && item.agentId === currentAgentId) {
            statusText = 'Your Chat';
            statusColor = 'blue';
            chatBgColor = '#e0f2fe';
        } else if (item.status === 'open' && item.agentId && item.agentId !== currentAgentId) {
            statusText = `Assigned to other agent`;
            statusColor = 'orange';
            chatBgColor = '#fffbe0';
        } else if (item.status === 'open' && !item.agentId) {
            statusText = 'New Chat (Unassigned)';
            statusColor = 'green';
            chatBgColor = '#e6ffe6';
        } else if (item.status === 'closed') {
            statusText = 'Closed';
            statusColor = 'red';
            chatBgColor = '#f3f4f6';
        }

        return (
            <TouchableOpacity
                style={[styles.chatItem, { backgroundColor: chatBgColor }]}
                onPress={() => navigation.navigate('AgentChat', { chatId: item.id, customerId: item.userId })}
                disabled={item.status === 'closed'}
            >
                <View>
                    <Text style={styles.chatItemTitle}>Chat with User ID: {item.userId.substring(0, 8)}...</Text>
                    <Text style={styles.chatItemDepartment}>Department: {item.assignedDepartment ? item.assignedDepartment.toUpperCase() : 'N/A'}</Text>
                    <Text style={[styles.chatItemStatus, { color: statusColor }]}>Status: {statusText}</Text>
                    {item.lastMessageAt && (
                        <Text style={styles.chatItemTimestamp}>
                            Last Message: {item.lastMessageAt.toLocaleString()}
                        </Text>
                    )}
                </View>
            </TouchableOpacity>
        );
    };

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#3498db" />
                <Text style={styles.loadingText}>Loading Chats...</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Active Chats</Text>
                <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
                    <MaterialIcons name="logout" size={24} color="white" />
                    <Text style={styles.logoutButtonText}>Logout</Text>
                </TouchableOpacity>
            </View>
            <Text style={styles.agentInfo}>Logged in as: {currentAgentEmail || 'N/A'}</Text>
            <Text style={styles.agentInfo}>Agent ID: {currentAgentId || 'N/A'}</Text>
            {currentAgentDepartment && <Text style={styles.agentInfo}>Handling Department: {currentAgentDepartment.toUpperCase()}</Text>}


            {chats.length === 0 ? (
                <Text style={styles.noChatsText}>No active chats found for your department.</Text>
            ) : (
                <FlatList
                    style={styles.chatList}
                    data={chats}
                    renderItem={renderChatItem}
                    keyExtractor={item => item.id}
                    contentContainerStyle={styles.chatListContent}
                    showsVerticalScrollIndicator={true}
                    showsHorizontalScrollIndicator={false}
                    scrollEnabled={true}
                    bounces={true}
                    overScrollMode="always"
                    refreshing={refreshing}
                    onRefresh={onRefresh}
                    indicatorStyle="black"
                    scrollIndicatorInsets={{ right: 1 }}
                    alwaysBounceVertical={true}
                />
            )}
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
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: '#3498db',
        padding: 15,
        paddingTop: Platform.OS === 'android' ? 40 : 15, // Adjust for status bar on Android
        borderBottomLeftRadius: 10,
        borderBottomRightRadius: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
        elevation: 5,
    },
    headerTitle: {
        fontSize: 24,
        fontWeight: 'bold',
        color: 'white',
    },
    logoutButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#e74c3c',
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 8,
    },
    logoutButtonText: {
        color: 'white',
        marginLeft: 5,
        fontWeight: 'bold',
    },
    agentInfo: {
        fontSize: 14,
        color: '#555',
        textAlign: 'center',
        marginTop: 5,
    },
    chatList: {
        flex: 1,
        backgroundColor: '#f0f4f8',
    },
    chatListContent: {
        padding: 15,
        paddingBottom: 30,
    },
    chatItem: {
        padding: 15,
        borderRadius: 10,
        marginBottom: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 3,
        elevation: 3,
        borderWidth: 1,
        borderColor: '#eee',
    },
    chatItemTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 5,
        color: '#333',
    },
    chatItemDepartment: { // New style for department display
        fontSize: 14,
        color: '#666',
        marginBottom: 3,
        fontWeight: '500',
    },
    chatItemStatus: {
        fontSize: 14,
        fontWeight: '600',
        marginBottom: 3,
    },
    chatItemTimestamp: {
        fontSize: 12,
        color: '#777',
    },
    noChatsText: {
        fontSize: 16,
        color: '#777',
        textAlign: 'center',
        marginTop: 50,
    },
});

export default AgentChatListScreen;
