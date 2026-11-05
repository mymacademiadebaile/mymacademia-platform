/** Spanish labels for audit log actions and entities, shared by the API (search) and the web (display). */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  ADMIN_PROFILE_UPDATED: "Perfil administrador actualizado",
  ADMIN_PASSWORD_CHANGED: "Contraseña administrador cambiada",
  PASSWORD_RESET_COMPLETED: "Contraseña restablecida por enlace",
  USER_CREATED: "Usuario creado",
  USER_UPDATED: "Usuario actualizado",
  USER_DELETED: "Usuario eliminado",
  STUDENT_CREATED: "Alumno creado",
  STUDENT_UPDATED: "Alumno actualizado",
  CONTACT_CREATED: "Contacto creado",
  CONTACT_UPDATED: "Contacto actualizado",
  CONTACT_DELETED: "Contacto eliminado",
  CONTACT_CONVERTED_TO_STUDENT: "Contacto convertido en alumno",
  OPPORTUNITY_UPDATED: "Seguimiento de contacto actualizado",
  PROFESSOR_CREATED: "Profesor creado",
  PROFESSOR_UPDATED: "Profesor actualizado",
  PROFESSOR_DELETED: "Profesor eliminado",
  PROFESSOR_PASSWORD_RESET: "Contraseña profesor restablecida",
  PROFESSOR_AVATAR_UPDATED: "Foto de profesor actualizada",
  PROFESSOR_AVATAR_REMOVED: "Foto de profesor eliminada",
  PROFESSOR_INTRO_VIDEO_UPDATED: "Video de profesor actualizado",
  PROFESSOR_INTRO_VIDEO_REMOVED: "Video de profesor eliminado",
  PROFESSOR_SELF_PROFILE_UPDATED: "Profesor actualizó su perfil",
  PROFESSOR_SELF_AVATAR_UPDATED: "Profesor actualizó su foto",
  PROFESSOR_SELF_AVATAR_REMOVED: "Profesor eliminó su foto",
  PROFESSOR_SELF_INTRO_VIDEO_UPDATED: "Profesor actualizó su video",
  PROFESSOR_SELF_INTRO_VIDEO_REMOVED: "Profesor eliminó su video",
  CLASS_CREATED: "Clase creada",
  CLASS_UPDATED: "Clase actualizada",
  CLASS_ARCHIVED: "Clase inactivada",
  CLASS_DELETED: "Clase eliminada",
  CLASS_PAUSED: "Clase en pausa",
  CLASS_RESUMED: "Clase reanudada",
  SCHEDULE_SERIES_CREATED: "Horario agregado",
  SCHEDULE_SERIES_CHANGED: "Horario cambiado desde una fecha",
  SCHEDULE_SERIES_ENDED: "Horario finalizado",
  CLASS_SESSION_SCHEDULED: "Clase del día programada",
  CLASS_SESSION_IN_PROGRESS: "Clase del día en curso",
  CLASS_SESSION_COMPLETED: "Clase del día realizada",
  CLASS_SESSION_SUSPENDED: "Clase del día suspendida",
  CLASS_SESSION_CANCELLED: "Clase del día cancelada",
  CLASS_SESSION_RESCHEDULED: "Clase del día reprogramada",
  CLASS_SESSION_RESCHEDULE_REVERTED: "Reprogramación revertida",
  CLASS_SESSION_REOPENED: "Clase del día reabierta",
  CLASS_SESSION_UPDATED: "Clase del día modificada",
  CLASS_SESSION_EXTRA_CREATED: "Clase extra creada",
  CLASS_ATTENDANCE_UPDATED: "Asistencia registrada",
  LATE_ENROLLMENT_PARTICIPANT_ADDED: "Alumno agregado a una lista cerrada",
  SESSION_PARTICIPANT_ADDED: "Alumno agregado a una fecha",
  SESSION_PARTICIPANT_REMOVED: "Alumno quitado de una fecha",
  SESSION_BOOKING_CANCELLED: "Turno cancelado",
  SESSION_BOOKING_TRANSFERRED: "Turno cambiado",
  HOLIDAY_CREATED: "Feriado cargado",
  HOLIDAY_DELETED: "Feriado quitado",
  SPACE_CREATED: "Pista creada",
  SPACE_UPDATED: "Pista actualizada",
  ENROLLMENT_CREATED: "Inscripción creada",
  ENROLLMENT_REACTIVATED: "Inscripción reactivada",
  ENROLLMENT_ENDED: "Inscripción finalizada",
  ENROLLMENT_MOVED: "Inscripción cambiada de clase",
  ENROLLMENT_BILLING_UPDATED: "Modalidad de cobro cambiada",
  ENROLLMENT_CONDITIONS_UPDATED: "Condiciones comerciales cambiadas",
  ENROLLMENT_SCHEDULES_UPDATED: "Turnos de inscripción cambiados",
  TRIAL_BOOKED: "Clase de prueba reservada",
  COURTESY_AUTHORIZED: "Clase de cortesía autorizada",
  TRIAL_CANCELLED: "Clase de prueba cancelada",
  TRIAL_CONVERTED_TO_ENROLLMENT: "Prueba convertida en inscripción",
  PROMOTION_CREATED: "Promoción creada",
  PROMOTION_DEACTIVATED: "Promoción cerrada",
  PROMOTION_PAIR_ENROLLED: "Pareja 2x1 inscripta",
  PROMOTION_PAIR_VOIDED: "Pareja 2x1 cerrada",
  CHARGE_CREATED: "Importe a cobrar creado",
  CHARGE_VOIDED: "Importe a cobrar anulado",
  MONTHLY_CHARGES_GENERATED: "Mensualidades generadas",
  COLLECTION_REGISTERED: "Cobro registrado",
  COLLECTION_VOIDED: "Cobro anulado",
  COLLECTION_PROOF_UPLOADED: "Comprobante adjuntado",
  CREDIT_APPLIED: "Saldo a favor aplicado",
  REFUND_REGISTERED: "Devolución registrada",
  FINANCIAL_ADJUSTMENT: "Ajuste financiero",
  BILLING_SETTINGS_UPDATED: "Reglas de cobro actualizadas",
  MIGRATION_ISSUE_RESOLVED: "Observación de migración resuelta",
  PAYMENT_CREATED: "Cuota creada",
  PAYMENT_UPDATED: "Pago actualizado",
  PAYMENT_MARKED_PAID: "Pago registrado",
  PAYMENT_CANCELLED: "Pago cancelado",
  PAYMENT_QUICK_CHARGE: "Cobro rápido registrado",
  PAYMENT_PROOF_UPLOADED: "Comprobante de pago adjuntado",
  PAYMENT_RECEIPT_EMAILED: "Recibo enviado por email",
  DEBT_REMINDER_POLICY_UPDATED: "Configuración de recordatorios actualizada",
  DEBT_REMINDER_RESERVED: "Recordatorio de deuda preparado",
  DEBT_REMINDER_SENT: "Recordatorio de deuda enviado",
  EMAIL_CAMPAIGN_SENT: "Campaña de email enviada",
  EMAIL_RETRIED: "Email reintentado",
  WHATSAPP_OPENED: "WhatsApp abierto",
  BRANCH_CREATED: "Sede creada",
  BRANCH_UPDATED: "Sede actualizada",
  CATALOG_CREATED: "Opción de catálogo creada",
  CATALOG_UPDATED: "Opción de catálogo actualizada",
  CATALOG_REORDERED: "Catálogo reordenado",
  CATALOG_IMAGE_UPDATED: "Imagen de ritmo actualizada",
  CATALOG_IMAGE_REMOVED: "Imagen de ritmo eliminada",
  ORGANIZATION_SETTINGS_UPDATED: "Configuración de academia actualizada",
  LANDING_IMAGE_UPDATED: "Imagen de la landing actualizada",
  LANDING_IMAGE_RESTORED: "Imagen de la landing restaurada",
  CHECK_IN_ACCESS_CODE_ISSUED: "Código de tablet generado",
  CHECK_IN_ACCESS_CODE_REVOKED: "Accesos de tablet revocados",
  CHECK_IN_AUTHORIZED_BY_ADMIN_LOGIN: "Tablet autorizada por un administrador",
  CHECK_IN_DEVICE_ACTIVATED: "Tablet activada",
  CHECK_IN_DEVICE_CREATED: "Tablet registrada",
  CHECK_IN_DEVICE_UPDATED: "Tablet actualizada",
  CHECK_IN_QR_ROTATED: "Credencial QR renovada",
  CHECK_IN_QR_REVOKED: "Credencial QR revocada"
};

export const AUDIT_ENTITY_LABELS: Record<string, string> = {
  User: "Usuarios",
  Student: "Alumnos",
  Contact: "Contactos",
  Opportunity: "Seguimientos",
  Professor: "Profesores",
  DanceClass: "Clases",
  ClassSchedule: "Horarios",
  ClassSession: "Clases del día",
  ClassAttendance: "Asistencias",
  SessionBooking: "Turnos",
  Holiday: "Feriados",
  DanceSpace: "Pistas",
  Enrollment: "Inscripciones",
  TrialBooking: "Clases de prueba",
  Promotion: "Promociones",
  PromotionPair: "Parejas 2x1",
  Charge: "Importes a cobrar",
  Collection: "Cobros",
  BillingPeriod: "Mensualidades",
  MigrationIssue: "Migración",
  Payment: "Pagos (sistema anterior)",
  NotificationLog: "Comunicaciones",
  DebtReminderSettings: "Recordatorios",
  Branch: "Sedes",
  CatalogItem: "Catálogos",
  Organization: "Academia",
  CheckInDevice: "Tablets de asistencia",
  CheckInCredential: "Credenciales QR"
};

function fold(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Readable label for an audit action; unknown codes fall back to the code itself. */
export function auditActionLabel(action: string) {
  return AUDIT_ACTION_LABELS[action] ?? action;
}

/** Readable label for an audited entity type. */
export function auditEntityLabel(entityType: string) {
  return AUDIT_ENTITY_LABELS[entityType] ?? entityType;
}

/** Action codes whose Spanish label contains the search term (accent and case insensitive). */
export function auditActionsMatching(term: string) {
  const needle = fold(term.trim());
  if (!needle) return [];
  return Object.entries(AUDIT_ACTION_LABELS)
    .filter(([, label]) => fold(label).includes(needle))
    .map(([code]) => code);
}

/** Entity types whose Spanish label contains the search term (accent and case insensitive). */
export function auditEntitiesMatching(term: string) {
  const needle = fold(term.trim());
  if (!needle) return [];
  return Object.entries(AUDIT_ENTITY_LABELS)
    .filter(([, label]) => fold(label).includes(needle))
    .map(([code]) => code);
}
