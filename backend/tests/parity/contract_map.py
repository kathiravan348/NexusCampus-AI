"""Frozen contract name (`frontend/packages/contracts`, D43) → the backend model that serves it (NEX-059)."""

from pydantic import BaseModel

from nexus.core.errors import ApiErrorEnvelope
from nexus.core.events import DomainEvent
from nexus.modules.m01.schemas import CalendarOut, CampusOut, GroupOut, InstitutionOut, LocaleSettings, TypeProfileOut
from nexus.modules.m02.schemas import (
    PermissionOut,
    PersonOut,
    RoleAssignmentOut,
    RoleOut,
    RoleProfileOut,
    SessionOut,
    UserOut,
)
from nexus.modules.m02.sso import SsoProviderOut
from nexus.modules.m03.schemas import FontOut, ThemeOut
from nexus.modules.m04.schemas import RevisionOut, TextOverrideOut
from nexus.modules.m05.router import EntitlementOut, PlanOut
from nexus.modules.m05.usage import UsageMeterOut
from nexus.modules.m06.packs import CompliancePackOut
from nexus.modules.m06.schemas import AuditEventOut, ConsentOut, DataSubjectRequestOut
from nexus.modules.m07.schemas import DeliveryOut, PreferenceOut, TemplateOut
from nexus.modules.m08.schemas import CustomFieldOut, FormOut, NumberingOut, WorkflowOut
from nexus.modules.m09.schemas import ColumnMappingOut, ImportJobOut, ImportRowIssueOut
from nexus.modules.m10.service import ConflictOut, DeviceOut
from nexus.modules.m11.schemas import AiCreditOut, AiSettingsOut, AssistAnswerOut
from nexus.modules.m12.schemas import (
    AdmissionOfferOut,
    ApplicationOut,
    EnquiryFormSummaryOut,
    EnquiryOut,
    PublicEnquiryFormOut,
    WaitlistEntryOut,
)
from nexus.modules.m13.schemas import EnrolmentOut, LearnerDocumentOut, LearnerOut
from nexus.modules.m14.schemas import AuthorisedPickupOut, GuardianRelationshipOut, HouseholdOut
from nexus.modules.m15.schemas import ClassGroupOut, ProgramOut, SubjectOfferingOut, SubjectOut, YearLevelOut
from nexus.modules.m16.schemas import BellScheduleOut, RoomOut, TeacherLoadOut, TimetableSlotOut
from nexus.modules.m17.schemas import AttendanceMarkOut, AttendanceSessionOut, LeaveRequestOut, RosterEntryOut
from nexus.modules.m18.schemas import ConcessionOut, FeeHeadOut, FeeInvoiceOut, FeePaymentOut, FeePlanOut, FeeRefundOut
from nexus.modules.m19.schemas import BudgetOut, JournalEntryOut, LedgerAccountOut
from nexus.modules.m20.schemas import AssessmentOut, GradingSchemeOut, MarkEntryOut, RubricOut
from nexus.modules.m21.schemas import ExamOut, ExamPaperOut, HallTicketOut, RevaluationRequestOut, SeatAssignmentOut
from nexus.modules.m22.schemas import IssuedDocumentOut, IssuedDocumentReadOut, ReportCardOut
from nexus.modules.m24.schemas import MeetingBookingOut, MeetingSlotOut, MessageThreadOut, NoticeOut, ThreadMessageOut
from nexus.modules.m28.schemas import KpiOut, RoleHomeOut
from nexus.modules.m83.access import AccessGrantOut, AccessRequestOut, BreakGlassNoticeOut
from nexus.modules.m83.keys import KeyStatusOut
from nexus.modules.m84.router import DiagnosticBundle, DiagnosticContent
from nexus.modules.m86.schemas import PromotionDecisionOut, RolloverRunOut

CONTRACT_MODELS: dict[str, type[BaseModel]] = {
    "ApiError": ApiErrorEnvelope,
    "DomainEvent": DomainEvent,
    "LocaleSettings": LocaleSettings,
    "Group": GroupOut,
    "Institution": InstitutionOut,
    "Campus": CampusOut,
    "InstitutionTypeProfile": TypeProfileOut,
    "AcademicCalendar": CalendarOut,
    "Person": PersonOut,
    "RoleProfile": RoleProfileOut,
    "User": UserOut,
    "Session": SessionOut,
    "SsoProvider": SsoProviderOut,
    "Permission": PermissionOut,
    "Role": RoleOut,
    "RoleAssignment": RoleAssignmentOut,
    "Theme": ThemeOut,
    "Font": FontOut,
    "TextOverride": TextOverrideOut,
    "TextOverrideRevision": RevisionOut,
    "Plan": PlanOut,
    "Entitlement": EntitlementOut,
    "UsageMeter": UsageMeterOut,
    "AuditEvent": AuditEventOut,
    "Consent": ConsentOut,
    "DataSubjectRequest": DataSubjectRequestOut,
    "CompliancePack": CompliancePackOut,
    "NotificationTemplate": TemplateOut,
    "NotificationDelivery": DeliveryOut,
    "NotificationPreference": PreferenceOut,
    "DeviceSync": DeviceOut,
    "SyncConflict": ConflictOut,
    "AiSettings": AiSettingsOut,
    "AiCredit": AiCreditOut,
    "AssistAnswer": AssistAnswerOut,
    "KeyStatus": KeyStatusOut,
    "AccessRequest": AccessRequestOut,
    "AccessGrant": AccessGrantOut,
    "BreakGlassNotice": BreakGlassNoticeOut,
    "DiagnosticBundle": DiagnosticBundle,
    "DiagnosticContent": DiagnosticContent,
    # Stage 3 (NEX-196).
    "CustomFieldDefinition": CustomFieldOut,
    "FormDefinition": FormOut,
    "WorkflowDefinition": WorkflowOut,
    "NumberingFormat": NumberingOut,
    "Program": ProgramOut,
    "YearLevel": YearLevelOut,
    "ClassGroup": ClassGroupOut,
    "Subject": SubjectOut,
    "SubjectOffering": SubjectOfferingOut,
    "Learner": LearnerOut,
    "Enrolment": EnrolmentOut,
    "LearnerDocument": LearnerDocumentOut,
    "Household": HouseholdOut,
    "GuardianRelationshipView": GuardianRelationshipOut,
    "AuthorisedPickup": AuthorisedPickupOut,
    "Enquiry": EnquiryOut,
    "Application": ApplicationOut,
    "AdmissionOffer": AdmissionOfferOut,
    "WaitlistEntry": WaitlistEntryOut,
    "EnquiryFormSummary": EnquiryFormSummaryOut,
    "PublicEnquiryForm": PublicEnquiryFormOut,
    "ImportJob": ImportJobOut,
    "ColumnMapping": ColumnMappingOut,
    "ImportRowIssue": ImportRowIssueOut,
    "Room": RoomOut,
    "BellSchedule": BellScheduleOut,
    "TimetableSlot": TimetableSlotOut,
    "TeacherLoad": TeacherLoadOut,
    "AttendanceSession": AttendanceSessionOut,
    "AttendanceMark": AttendanceMarkOut,
    "AttendanceRosterEntry": RosterEntryOut,
    "LeaveRequest": LeaveRequestOut,
    "FeeHead": FeeHeadOut,
    "FeePlan": FeePlanOut,
    "Concession": ConcessionOut,
    "FeeInvoice": FeeInvoiceOut,
    "FeePayment": FeePaymentOut,
    "FeeRefund": FeeRefundOut,
    "LedgerAccount": LedgerAccountOut,
    "JournalEntry": JournalEntryOut,
    "Budget": BudgetOut,
    "GradingScheme": GradingSchemeOut,
    "Rubric": RubricOut,
    "Assessment": AssessmentOut,
    "MarkEntry": MarkEntryOut,
    "Exam": ExamOut,
    "ExamPaper": ExamPaperOut,
    "SeatAssignment": SeatAssignmentOut,
    "HallTicket": HallTicketOut,
    "RevaluationRequest": RevaluationRequestOut,
    "ReportCard": ReportCardOut,
    "IssuedDocument": IssuedDocumentOut,
    "IssuedDocumentRead": IssuedDocumentReadOut,
    "MessageThread": MessageThreadOut,
    "ThreadMessage": ThreadMessageOut,
    "Notice": NoticeOut,
    "MeetingSlot": MeetingSlotOut,
    "MeetingBooking": MeetingBookingOut,
    "RoleHome": RoleHomeOut,
    "Kpi": KpiOut,
    "RolloverRun": RolloverRunOut,
    "PromotionDecision": PromotionDecisionOut,
}
