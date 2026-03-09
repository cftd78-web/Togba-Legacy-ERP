# TOGBA LEGACY ERP
Complete System Blueprint, Architecture, Database Schema, Security Model, and Codex Development Handoff

Version: 24
Platform: Google Apps Script Web App
Frontend: HTML + TailwindCSS + Chart.js
Backend: Google Apps Script (Code.gs)
Database: Google Sheets

------------------------------------------------------------
1. SYSTEM PURPOSE
------------------------------------------------------------

The Togba Legacy ERP is a private family governance and coordination platform.

It manages:

• family registry
• lineage database
• financial contributions
• founder capital locks
• governance voting
• internal messaging
• emergency SOS alerts
• project management
• historical timeline
• event coordination

The system runs as a Google Apps Script Web App backed by Google Sheets.

------------------------------------------------------------
2. SYSTEM ARCHITECTURE
------------------------------------------------------------

Browser (Mobile/Desktop)
        │
        ▼
Index.html (Frontend UI)
        │
        ▼
google.script.run API
        │
        ▼
Code.gs (Apps Script Backend)
        │
        ▼
Google Sheets (Database)

------------------------------------------------------------
3. HIGH LEVEL ARCHITECTURE DIAGRAM
------------------------------------------------------------

User Device
      │
      ▼
Index.html Frontend
      │
      ▼
Apps Script API
      │
      ▼
Code.gs Backend
      │
      ▼
Google Sheets Database

------------------------------------------------------------
4. AUTHENTICATION MODEL
------------------------------------------------------------

Authentication uses One Time Password login.

LOGIN FLOW

1 User enters email
2 Server generates OTP
3 OTP stored in Access sheet
4 User enters OTP
5 Server verifies OTP
6 Session token generated
7 Token stored in CacheService
8 Session expires after 6 hours

------------------------------------------------------------
5. SECURITY MODEL
------------------------------------------------------------

Security protections include:

• atomic OTP generation
• session token system
• sheet validation layer
• role based access control
• admin only modules
• adult only SOS media viewing
• OTP rate limiting

------------------------------------------------------------
6. CORE DESIGN PRINCIPLES
------------------------------------------------------------

1 Never rename spreadsheet headers
2 Never rename sheet names
3 Never remove working modules
4 Always validate sheet existence
5 Backend logic stays in Code.gs
6 Frontend must never freeze
7 Maintain backward compatibility
8 Extend system without rewriting core logic

------------------------------------------------------------
7. DATABASE SCHEMA (22 SHEETS)
------------------------------------------------------------

IDENTITY

Access
PersonID
EmailOptional
FullName
OneTimeCode
PublicKey
Role

People
RelationshipToPatriarch
GenerationTier
FatherID
MotherID
SpouseFullNameOptional

Photos
PersonID
PhotoFileURL
PhotoType

------------------------------------------------------------

FINANCE

Contributions
AmountUSD
ContributionType
Year
Quarter
Email

FounderLocks
AmountUSD
ExpiryDate
LockYears
Released

ContributionTiers
GenerationTier
QuarterlyAmountUSD

InstitutionSettings
SettingKey
SettingValue

------------------------------------------------------------

OPERATIONS

Projects
ProjectID
Title
GoalUSD
Status

ProjectTasks
ProjectID
PercentComplete
Status
Priority

ProjectUpdates
UpdateID
ProjectID
TaskID
UpdateText

------------------------------------------------------------

COMMUNICATION

Messages
ChannelID
SenderEmail
Body
SentAt

Channels
ChannelID
Name
Type
IsActive

ChannelMembers
ChannelID
Email
MemberRole

------------------------------------------------------------

SAFETY

SOSAlerts
ReporterEmail
Lat
Lng
Status
WhatsAppLink

SOSMedia
SOSID
MediaType
FileURL

Settings
Key
Value

------------------------------------------------------------

GOVERNANCE

Votes
VoteID
Title
ThresholdType
Status

VoteBallots
VoteID
VoterEmail
VoteChoice

------------------------------------------------------------

LEGACY

History
Title
EventDate
EventType
Description

Events
EventID
Title
EventDate
Recurrence

------------------------------------------------------------

SYSTEM

Roles
Email
RoleName
IsAdult

------------------------------------------------------------
8. DATABASE RELATIONSHIP MAP
------------------------------------------------------------

Access.PersonID → People.PersonID  
People.PersonID → Photos.PersonID  

Access.EmailOptional → Contributions.Email  
Access.EmailOptional → FounderLocks.Email  

Votes.VoteID → VoteBallots.VoteID  
Access.EmailOptional → VoteBallots.VoterEmail  

Channels.ChannelID → Messages.ChannelID  
Channels.ChannelID → ChannelMembers.ChannelID  

SOSAlerts.SOSID → SOSMedia.SOSID  

Projects.ProjectID → ProjectTasks.ProjectID  
ProjectTasks.TaskID → ProjectUpdates.TaskID  

------------------------------------------------------------
9. MODULE LIST
------------------------------------------------------------

Authentication Module
Dashboard Module
Finance Module
Governance Voting Module
Messaging Module
SOS Emergency Module
Project Management Module
Historical Timeline Module
Family Registry Module

------------------------------------------------------------
10. MODULE CONTRACT TABLE
------------------------------------------------------------

AUTHENTICATION

Functions

loginStepOne  
verifyStepTwo  
_auth  

Sheets

Access

------------------------------------------------------------

DASHBOARD

Functions

getDashboardData

Sheets

Access
People
Photos
Contributions

------------------------------------------------------------

FINANCE

Functions

getFinanceData

Sheets

Contributions
FounderLocks
InstitutionSettings

------------------------------------------------------------

GOVERNANCE

Functions

createVote
castVote
tallyVotes

Sheets

Votes
VoteBallots

------------------------------------------------------------

MESSAGING

Functions

createChannel
sendMessage
getMessages

Sheets

Messages
Channels
ChannelMembers

------------------------------------------------------------

SOS

Functions

triggerSOS
uploadSOSMedia

Sheets

SOSAlerts
SOSMedia
Settings

------------------------------------------------------------

PROJECTS

Functions

createProject
updateTask
getProjectStatus

Sheets

Projects
ProjectTasks
ProjectUpdates

------------------------------------------------------------

TIMELINE

Functions

getHistoryEvents
getUpcomingEvents

Sheets

History
Events

------------------------------------------------------------

REGISTRY

Functions

adminGetAllUsers

Sheets

Access
Roles

------------------------------------------------------------
11. DATA FLOW
------------------------------------------------------------

LOGIN FLOW

User enters email
→ loginStepOne
→ OTP generated
→ OTP stored
→ user enters OTP
→ verifyStepTwo
→ session token generated

------------------------------------------------------------

DASHBOARD FLOW

initApp
→ getDashboardData
→ join Access + People + Photos + Contributions

------------------------------------------------------------

FINANCE FLOW

loadCharts
→ getFinanceData
→ aggregate contributions
→ return chart data

------------------------------------------------------------
12. PERFORMANCE OPTIMIZATION RULES
------------------------------------------------------------

1 Backend must read sheets once per request
2 Use header mapping instead of indexOf
3 Cache dashboard calculations
4 Cache finance calculations for 5 minutes
5 Avoid repeated SpreadsheetApp calls

------------------------------------------------------------
13. ERROR HANDLING RULES
------------------------------------------------------------

All backend functions must use try/catch.

Errors must return structured responses:

success:false  
message:"error text"

------------------------------------------------------------
14. FRONTEND SAFETY RULES
------------------------------------------------------------

Every google.script.run call must include:

withSuccessHandler  
withFailureHandler  

This prevents loading freezes.

------------------------------------------------------------
15. SESSION MANAGEMENT
------------------------------------------------------------

Session tokens stored in CacheService.

Expiration: 6 hours.

If token invalid:

frontend must force logout
display message
redirect to login

------------------------------------------------------------
16. OTP RATE LIMITING
------------------------------------------------------------

Maximum 5 OTP requests per email per hour.

OTP must be generated using LockService to prevent race conditions.

------------------------------------------------------------
17. ADMIN SECURITY
------------------------------------------------------------

Admin modules only visible if:

user.role === Admin

Admin capabilities:

view all users
create OTP codes
manage registry

------------------------------------------------------------
18. FUTURE EXTENSIONS
------------------------------------------------------------

Family Trust Management  
Investment Portfolio Tracking  
Insurance Registry  
Digital Archive  
Push Notifications  
Mobile App Version  

------------------------------------------------------------
19. CODEX DEVELOPMENT SAFETY RULE
------------------------------------------------------------

This system already contains working functionality.

Existing working modules include:

Authentication
Dashboard loading
Finance aggregation
Admin registry

Codex must NOT rebuild these modules.

Codex must only EXTEND the system.

Codex must not:

rename sheets
rename headers
rewrite authentication
change architecture

------------------------------------------------------------
20. DEPLOYMENT PROCEDURE
------------------------------------------------------------

1 Create Google Apps Script project
2 Upload Code.gs
3 Upload Index.html
4 Deploy as Web App
5 Set access to Anyone with link
6 Test login
7 Test dashboard
8 Test finance chart

------------------------------------------------------------
21. CODEX INSTRUCTION
------------------------------------------------------------

Before writing code:

1 Read this entire document
2 Audit the system
3 Identify missing modules
4 Produce phased implementation plan

Do not write code until the plan is approved.

END OF DOCUMENT
------------------------------------------------------------
22. PHASE 9 BACKWARD-COMPATIBLE EXTENSIONS
------------------------------------------------------------

Phase 9 introduces optional enhancements while preserving the locked baseline schema.

Optional headers supported (no rename required):

Projects sheet optional headers:
- Description
- ImageURL (or legacy aliases: ThumbnailURL, ProjectImageURL)

ProjectTasks sheet optional headers:
- TaskTitle (or Title)
- AssigneeType (internal or external)
- Assignee (or AssignedTo, AssigneeValue)

Votes sheet optional headers:
- ImageURL (or ProposalImageURL, ThumbnailURL)

People sheet optional header:
- FullName (or Name)

Settings sheet expected keys surfaced in admin/system health:
- InstitutionName
- SupportEmail
- DefaultCurrency
- EmergencyContact
- WhatsAppNumber (for WhatsApp emergency action)
- WhatsAppMessageTemplate (optional)
- SOSEmergencyAction (optional)

OTP delivery:
- OTP remains atomically generated and stored in Access.OneTimeCode.
- Intended path is MailApp email delivery to the user email.
- If email send fails, system returns delivery status and remains safe for fallback flows.


------------------------------------------------------------
23. ENHANCEMENT TASK 1 IMPLEMENTATION NOTES
------------------------------------------------------------

Projects enhancements implemented backward-compatibly:

- Project creation now supports optional Description and ImageURL aliases.
- Project board and project list responses now surface description and image metadata when headers are present.
- Task payloads now support TaskTitle, AssigneeType, and Assignee/AssignedTo aliases for both create and update flows.
- AssigneeType is normalized and validated to internal or external.
- No locked baseline header names were changed; optional alias logic is used where available.

Messaging enhancements implemented backward-compatibly:

- Channel creation flow preserved and extended with safer active-channel membership checks.
- Channel join flow now rejects inactive channels.
- Message read/send still enforces authorized membership via ChannelMembers.
- Active channel directory endpoint returns only active channels and a joined flag for safe UI membership controls.

Compatibility and safety:

- Existing authentication/session token checks remain required for all modified backend functions.
- Existing Messages, Channels, ChannelMembers, Projects, ProjectTasks, and ProjectUpdates baseline behavior is preserved.
- No sheet/tab/header renames or column reordering introduced.

