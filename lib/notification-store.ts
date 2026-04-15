import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Notifications from 'expo-notifications'
import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite'

const LEGACY_NOTIFICATION_STORE_KEY = 'notificationStore'
const NOTIFICATIONS_DB_NAME = 'biovault-notifications.db'
const MAX_STORED_NOTIFICATIONS = 100
const MIN_REASONABLE_NOTIFICATION_YEAR = 2020

export interface StoredNotification {
	id: string
	title: string
	body: string
	subtitle?: string
	receivedAt: string
	url?: string
}

let dbPromise: Promise<SQLiteDatabase> | null = null
let schemaReadyPromise: Promise<void> | null = null
let migrationPromise: Promise<void> | null = null

function isReasonableDate(value: Date): boolean {
	return Number.isFinite(value.getTime()) && value.getUTCFullYear() >= MIN_REASONABLE_NOTIFICATION_YEAR
}

function normalizeTimestampCandidate(value: unknown): string | null {
	if (value == null) {
		return null
	}

	if (value instanceof Date) {
		return isReasonableDate(value) ? value.toISOString() : null
	}

	if (typeof value === 'number' && Number.isFinite(value)) {
		const parsed = new Date(value)
		return isReasonableDate(parsed) ? parsed.toISOString() : null
	}

	if (typeof value === 'string') {
		const trimmed = value.trim()
		if (!trimmed) {
			return null
		}

		const numeric = Number(trimmed)
		if (Number.isFinite(numeric)) {
			const parsedNumeric = new Date(numeric)
			if (isReasonableDate(parsedNumeric)) {
				return parsedNumeric.toISOString()
			}
		}

		const parsed = new Date(trimmed)
		return isReasonableDate(parsed) ? parsed.toISOString() : null
	}

	return null
}

function extractNotificationUrl(notification: Notifications.Notification): string | undefined {
	const url = notification.request.content.data?.url
	return typeof url === 'string' ? url : undefined
}

function extractNotificationTimestamp(notification: Notifications.Notification): string {
	const trigger = notification.request.trigger
	const pushTrigger =
		trigger && typeof trigger === 'object' && 'type' in trigger && trigger.type === 'push' ? trigger : null
	const remoteMessage =
		pushTrigger && 'remoteMessage' in pushTrigger
			? (pushTrigger as { remoteMessage?: { sentTime?: string; notification?: { eventTime?: string } } }).remoteMessage
			: undefined
	const payload = pushTrigger && 'payload' in pushTrigger ? (pushTrigger as { payload?: unknown }).payload : undefined
	const data = notification.request.content.data

	const payloadRecord =
		typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>) : null

	const candidates = [
		notification.date,
		remoteMessage?.sentTime,
		remoteMessage?.notification?.eventTime,
		data?.sentAt,
		data?.sent_at,
		data?.timestamp,
		data?.createdAt,
		data?.created_at,
		payloadRecord?.sentAt,
		payloadRecord?.sent_at,
		payloadRecord?.timestamp,
		payloadRecord?.createdAt,
		payloadRecord?.created_at,
	]

	for (const candidate of candidates) {
		const normalized = normalizeTimestampCandidate(candidate)
		if (normalized) {
			return normalized
		}
	}

	return new Date().toISOString()
}

function normalizeStoredNotification(value: unknown): StoredNotification | null {
	if (typeof value !== 'object' || value === null) {
		return null
	}

	const item = value as Partial<StoredNotification>
	if (
		typeof item.id !== 'string' ||
		typeof item.title !== 'string' ||
		typeof item.body !== 'string' ||
		typeof item.receivedAt !== 'string'
	) {
		return null
	}

	return {
		id: item.id,
		title: item.title,
		body: item.body,
		subtitle: typeof item.subtitle === 'string' ? item.subtitle : undefined,
		receivedAt: normalizeTimestampCandidate(item.receivedAt) ?? new Date().toISOString(),
		url: typeof item.url === 'string' ? item.url : undefined,
	}
}

async function ensureSchema(db: SQLiteDatabase) {
	await db.execAsync(`
		PRAGMA journal_mode = WAL;
		CREATE TABLE IF NOT EXISTS notifications (
			id TEXT PRIMARY KEY NOT NULL,
			title TEXT NOT NULL,
			body TEXT NOT NULL,
			subtitle TEXT,
			received_at TEXT NOT NULL,
			url TEXT
		);
		CREATE INDEX IF NOT EXISTS idx_notifications_received_at
		ON notifications (received_at DESC);
	`)
}

async function getDb() {
	if (!dbPromise) {
		dbPromise = openDatabaseAsync(NOTIFICATIONS_DB_NAME)
	}

	const db = await dbPromise
	if (!schemaReadyPromise) {
		schemaReadyPromise = ensureSchema(db)
	}

	await schemaReadyPromise
	return db
}

async function migrateLegacyNotifications(db: SQLiteDatabase) {
	try {
		const raw = await AsyncStorage.getItem(LEGACY_NOTIFICATION_STORE_KEY)
		if (!raw) {
			return
		}

		const parsed = JSON.parse(raw)
		if (!Array.isArray(parsed) || parsed.length === 0) {
			await AsyncStorage.removeItem(LEGACY_NOTIFICATION_STORE_KEY)
			return
		}

		const notifications = parsed
			.map(normalizeStoredNotification)
			.filter((item): item is StoredNotification => item !== null)
			.sort((left, right) => right.receivedAt.localeCompare(left.receivedAt))
			.slice(0, MAX_STORED_NOTIFICATIONS)

		if (notifications.length > 0) {
			await db.withExclusiveTransactionAsync(async (txn) => {
				for (const item of notifications) {
					await txn.runAsync(
						`INSERT OR REPLACE INTO notifications
							(id, title, body, subtitle, received_at, url)
						 VALUES (?, ?, ?, ?, ?, ?)`,
						item.id,
						item.title,
						item.body,
						item.subtitle ?? null,
						item.receivedAt,
						item.url ?? null
					)
				}
			})
		}

		await AsyncStorage.removeItem(LEGACY_NOTIFICATION_STORE_KEY)
	} catch (error) {
		console.error('Failed to migrate legacy notifications:', error)
	}
}

async function ensureMigration() {
	if (!migrationPromise) {
		migrationPromise = getDb().then(migrateLegacyNotifications)
	}

	await migrationPromise
}

type NotificationRow = {
	id: string
	title: string
	body: string
	subtitle: string | null
	received_at: string
	url: string | null
}

export function mapExpoNotificationToStoredNotification(
	notification: Notifications.Notification
): StoredNotification {
	const receivedAt = extractNotificationTimestamp(notification)
	const identifier = notification.request.identifier || `${Date.now()}`
	const content = notification.request.content
	const title = content.title?.trim() || 'Notification'
	const body = content.body?.trim() || 'Open to view more details.'
	const subtitle = content.subtitle?.trim() || undefined

	return {
		id: `${identifier}-${new Date(receivedAt).getTime()}`,
		title,
		body,
		subtitle,
		receivedAt,
		url: extractNotificationUrl(notification),
	}
}

export async function storeNotification(notification: Notifications.Notification): Promise<void> {
	await ensureMigration()
	const db = await getDb()
	const nextItem = mapExpoNotificationToStoredNotification(notification)

	await db.withExclusiveTransactionAsync(async (txn) => {
		await txn.runAsync(
			`INSERT OR REPLACE INTO notifications
				(id, title, body, subtitle, received_at, url)
			 VALUES (?, ?, ?, ?, ?, ?)`,
			nextItem.id,
			nextItem.title,
			nextItem.body,
			nextItem.subtitle ?? null,
			nextItem.receivedAt,
			nextItem.url ?? null
		)

		await txn.runAsync(
			`DELETE FROM notifications
			 WHERE id NOT IN (
			 	SELECT id
			 	FROM notifications
			 	ORDER BY received_at DESC, id DESC
			 	LIMIT ?
			 )`,
			MAX_STORED_NOTIFICATIONS
		)
	})
}

export async function listStoredNotifications(): Promise<StoredNotification[]> {
	await ensureMigration()
	const db = await getDb()
	const rows = await db.getAllAsync<NotificationRow>(
		`SELECT id, title, body, subtitle, received_at, url
		 FROM notifications
		 ORDER BY received_at DESC, id DESC
		 LIMIT ?`,
		MAX_STORED_NOTIFICATIONS
	)

	return rows.map((row) => ({
		id: row.id,
		title: row.title,
		body: row.body,
		subtitle: row.subtitle ?? undefined,
		receivedAt: row.received_at,
		url: row.url ?? undefined,
	}))
}

export async function clearStoredNotifications(): Promise<void> {
	await ensureMigration()
	const db = await getDb()
	await db.runAsync('DELETE FROM notifications')
}
