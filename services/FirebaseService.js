const admin = require('firebase-admin');
const path = require('path');

/**
 * Firebase Cloud Messaging Service
 * Handles sending push notifications to mobile devices
 */

class FCMService {
    constructor() {
        this.initialized = false;
        this.initializeFirebase();
    }

    /**
     * Initialize Firebase Admin SDK
     */
    initializeFirebase() {
        try {
            const serviceAccountPath = path.join(__dirname, '../taxlah-react-native-firebasesdk.json');
            const serviceAccount = require(serviceAccountPath);

            if (!admin.apps.length) {
                admin.initializeApp({
                    credential: admin.credential.cert(serviceAccount)
                });
                this.initialized = true;
                console.log('✓ Firebase Admin SDK initialized successfully');
            } else {
                this.initialized = true;
                console.log('✓ Firebase Admin SDK already initialized');
            }
        } catch (error) {
            console.error('Failed to initialize Firebase Admin SDK:', error.message);
            this.initialized = false;
        }
    }

    /**
     * Send push notification to a single device
     * @param {string} fcmToken - Device FCM token
     * @param {object} notification - Notification payload
     * @param {string} notification.title - Notification title
     * @param {string} notification.body - Notification body
     * @param {object} data - Additional data payload (optional)
     * @returns {object} - Result with success status
     */
    async sendToDevice(fcmToken, notification, data = {}) {
        if (!this.initialized) {
            return {
                success: false,
                message: 'Firebase not initialized',
                error: 'FCM_NOT_INITIALIZED'
            };
        }

        if (!fcmToken) {
            return {
                success: false,
                message: 'FCM token is required',
                error: 'MISSING_FCM_TOKEN'
            };
        }

        if (!notification.title || !notification.body) {
            return {
                success: false,
                message: 'Notification title and body are required',
                error: 'MISSING_NOTIFICATION_DATA'
            };
        }

        const message = {
            token: fcmToken,
            notification: {
                title: notification.title,
                body: notification.body
            },
            data: {
                ...data,
                click_action: 'FLUTTER_NOTIFICATION_CLICK',
                sound: 'default'
            },
            android: {
                priority: 'high',
                notification: {
                    sound: 'default',
                    channelId: 'ezquran_notifications'
                }
            },
            apns: {
                payload: {
                    aps: {
                        sound: 'default',
                        badge: 1
                    }
                }
            }
        };

        try {
            const response = await admin.messaging().send(message);
            
            return {
                success: true,
                message: 'Push notification sent successfully',
                data: {
                    messageId: response
                }
            };
        } catch (error) {
            console.error('Error sending FCM notification:', error);
            
            // Handle specific FCM errors
            if (error.code === 'messaging/invalid-registration-token' ||
                error.code === 'messaging/registration-token-not-registered') {
                return {
                    success: false,
                    message: 'Invalid or expired FCM token',
                    error: 'INVALID_FCM_TOKEN',
                    shouldRemoveToken: true
                };
            }

            return {
                success: false,
                message: 'Failed to send push notification',
                error: error.message
            };
        }
    }

    /**
     * Send push notification to multiple devices
     * @param {array} fcmTokens - Array of device FCM tokens
     * @param {object} notification - Notification payload
     * @param {object} data - Additional data payload (optional)
     * @returns {object} - Result with success/failure counts
     */
    async sendToMultipleDevices(fcmTokens, notification, data = {}) {
        if (!this.initialized) {
            return {
                success: false,
                message: 'Firebase not initialized',
                error: 'FCM_NOT_INITIALIZED'
            };
        }

        if (!fcmTokens || fcmTokens.length === 0) {
            return {
                success: false,
                message: 'At least one FCM token is required',
                error: 'MISSING_FCM_TOKENS'
            };
        }

        if (!notification.title || !notification.body) {
            return {
                success: false,
                message: 'Notification title and body are required',
                error: 'MISSING_NOTIFICATION_DATA'
            };
        }

        const message = {
            notification: {
                title: notification.title,
                body: notification.body
            },
            data: {
                ...data,
                click_action: 'FLUTTER_NOTIFICATION_CLICK',
                sound: 'default'
            },
            android: {
                priority: 'high',
                notification: {
                    sound: 'default',
                    channelId: 'ezquran_notifications'
                }
            },
            apns: {
                payload: {
                    aps: {
                        sound: 'default',
                        badge: 1
                    }
                }
            },
            tokens: fcmTokens
        };

        try {
            const response = await admin.messaging().sendEachForMulticast(message);
            
            const invalidTokens = [];
            if (response.responses) {
                response.responses.forEach((resp, idx) => {
                    if (!resp.success) {
                        const error = resp.error;
                        if (error.code === 'messaging/invalid-registration-token' ||
                            error.code === 'messaging/registration-token-not-registered') {
                            invalidTokens.push(fcmTokens[idx]);
                        }
                    }
                });
            }

            return {
                success: response.successCount > 0,
                message: `Sent to ${response.successCount} of ${fcmTokens.length} devices`,
                data: {
                    successCount: response.successCount,
                    failureCount: response.failureCount,
                    invalidTokens: invalidTokens
                }
            };
        } catch (error) {
            console.error('Error sending multicast FCM notification:', error);
            return {
                success: false,
                message: 'Failed to send push notifications',
                error: error.message
            };
        }
    }

    /**
     * Send notification to a topic
     * @param {string} topic - Topic name
     * @param {object} notification - Notification payload
     * @param {object} data - Additional data payload (optional)
     * @returns {object} - Result
     */
    async sendToTopic(topic, notification, data = {}) {
        if (!this.initialized) {
            return {
                success: false,
                message: 'Firebase not initialized',
                error: 'FCM_NOT_INITIALIZED'
            };
        }

        if (!topic) {
            return {
                success: false,
                message: 'Topic is required',
                error: 'MISSING_TOPIC'
            };
        }

        const message = {
            topic: topic,
            notification: {
                title: notification.title,
                body: notification.body
            },
            data: {
                ...data,
                click_action: 'FLUTTER_NOTIFICATION_CLICK',
                sound: 'default'
            },
            android: {
                priority: 'high',
                notification: {
                    sound: 'default',
                    channelId: 'ezquran_notifications'
                }
            },
            apns: {
                payload: {
                    aps: {
                        sound: 'default',
                        badge: 1
                    }
                }
            }
        };

        try {
            const response = await admin.messaging().send(message);
            
            return {
                success: true,
                message: 'Topic notification sent successfully',
                data: {
                    messageId: response
                }
            };
        } catch (error) {
            console.error('Error sending topic notification:', error);
            return {
                success: false,
                message: 'Failed to send topic notification',
                error: error.message
            };
        }
    }

    /**
     * Subscribe device tokens to a topic
     * @param {array} tokens - Array of device tokens
     * @param {string} topic - Topic name
     * @returns {object} - Result
     */
    async subscribeToTopic(tokens, topic) {
        if (!this.initialized) {
            return {
                success: false,
                message: 'Firebase not initialized'
            };
        }

        try {
            const response = await admin.messaging().subscribeToTopic(tokens, topic);
            
            return {
                success: response.successCount > 0,
                message: `Subscribed ${response.successCount} devices to topic`,
                data: {
                    successCount: response.successCount,
                    failureCount: response.failureCount
                }
            };
        } catch (error) {
            console.error('Error subscribing to topic:', error);
            return {
                success: false,
                message: 'Failed to subscribe to topic',
                error: error.message
            };
        }
    }

    /**
     * Unsubscribe device tokens from a topic
     * @param {array} tokens - Array of device tokens
     * @param {string} topic - Topic name
     * @returns {object} - Result
     */
    async unsubscribeFromTopic(tokens, topic) {
        if (!this.initialized) {
            return {
                success: false,
                message: 'Firebase not initialized'
            };
        }

        try {
            const response = await admin.messaging().unsubscribeFromTopic(tokens, topic);
            
            return {
                success: response.successCount > 0,
                message: `Unsubscribed ${response.successCount} devices from topic`,
                data: {
                    successCount: response.successCount,
                    failureCount: response.failureCount
                }
            };
        } catch (error) {
            console.error('Error unsubscribing from topic:', error);
            return {
                success: false,
                message: 'Failed to unsubscribe from topic',
                error: error.message
            };
        }
    }
}

// Create singleton instance
const fcmService = new FCMService();

module.exports = fcmService;
