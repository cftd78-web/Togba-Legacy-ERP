# Togba Legacy ERP

## Overview

Togba Legacy ERP is a private family governance and management platform designed to manage multi-generational family data, financial contributions, governance voting, emergency communication, and long-term legacy planning.

The system functions as a lightweight ERP built on:

- Google Apps Script (backend)
- HTML + JavaScript frontend
- Google Sheets acting as the structured database
- GitHub for version control and development tracking

The objective of the platform is to provide a secure, scalable digital infrastructure for managing family structure, financial systems, governance processes, and long-term legacy coordination.

This system is designed specifically for the Togba family governance initiative but can serve as a model architecture for similar private family governance systems.

---

## Core System Modules

### Identity and Family Registry
- Person records
- Family relationships
- Generation tiers
- Photo history tracking
- Contact and residence data

### Financial System
- Member contributions
- Founder capital lock system
- Investment allocation tracking
- Contribution tier management
- Long-term financial projections

### Governance System
- Voting proposal creation
- Ballot collection
- Threshold enforcement
- Vote result reporting

### Communication System
- Internal messaging channels
- Member communication logs

### Emergency SOS System
- Emergency alert reporting
- GPS location capture
- Media uploads (photo/video/audio)
- WhatsApp emergency integration

### Project Management
- Project registry
- Task tracking
- Progress reporting

### Historical Timeline
- Family history records
- Important milestone events
- Recurring event management

---

## System Architecture

The system follows a three-layer architecture.

### Data Layer

Google Sheets serves as the database.

Each spreadsheet tab functions as a structured table containing defined columns and data relationships.

Examples of core tables include:

- Access
- People
- Contributions
- FounderLocks
- ContributionTiers
- Votes
- VoteBallots
- Messages
- Channels
- SOSAlerts
- SOSMedia
- Projects
- ProjectTasks
- History
- Events

The database schema is formally documented in:

MASTER_HANDOFF_TOGBA_LEGACY_ERP.md

The database schema is locked and must not be modified without explicit architectural approval.

---

### Backend Layer

The backend is implemented using Google Apps Script.

Primary backend file:

Code.gs

Responsibilities include:

- Authentication and session management
- Database access and validation
- Financial calculations
- Governance vote processing
- Emergency alert handling
- Security enforcement
- Business logic execution

The backend communicates with the frontend using the Google Apps Script interface:

google.script.run

---

### Frontend Layer

The frontend is implemented using HTML and JavaScript.

Primary frontend file:

Index.html

Frontend responsibilities include:

- Rendering the user interface
- Calling backend functions
- Displaying system data
- Managing user interaction
- Rendering charts and dashboards

UI technologies include:

- HTML5
- JavaScript
- Tailwind CSS
- Chart.js

---

## Security Design

Security is implemented at several levels.

Authentication
- One-time password login system
- Session token generation
- Session expiration enforcement

Backend Protection
- LockService protection during OTP generation
- Defensive try/catch error handling
- Role-based access control

Authorization
- Admin role validation for sensitive functions
- Restricted access to administrative features

Frontend Protection
- Mandatory success and failure handlers on all backend calls
- Prevention of silent application failures
- Automatic session expiration handling

---

## Repository Structure

The repository contains the following files:

Togba-Legacy-ERP

Code.gs  
Google Apps Script backend implementation

Index.html  
Frontend user interface

MASTER_HANDOFF_TOGBA_LEGACY_ERP.md  
Full architecture and database schema specification

AGENTS.md  
AI development instructions for Codex and automated agents

README.md  
Project documentation

---

## Development Rules

All development must follow the instructions defined in:

AGENTS.md

The following rules are critical:

- Do not rename spreadsheet tabs
- Do not rename spreadsheet headers
- Do not restructure database tables
- Do not delete existing fields
- Do not remove working modules
- Maintain backward compatibility with existing data
- Extend the system rather than rebuilding it
- Always provide complete file replacements rather than code snippets
- Ensure all backend functions contain defensive error handling

---

## Deployment

Deployment process:

1. Create the Google Sheets database
2. Create a Google Apps Script project linked to the spreadsheet
3. Upload Code.gs
4. Upload Index.html
5. Deploy the project as a Web App
6. Configure spreadsheet access permissions
7. Configure initial administrator accounts

Once deployed, the system functions as a browser-based web application.

---

## Version Control

GitHub is used for:

- source code backup
- version tracking
- safe development workflow
- Codex AI assisted development
- rollback capability in case of breaking changes

All major changes should be committed to the repository.

---

## Intended Use

This system is designed for private family governance and legacy management.

It is not intended to be a public software platform.

The GitHub repository should remain private to protect sensitive family information.

---

## Future Roadmap

Planned future enhancements include:

- mobile interface improvements
- project Gantt charts
- advanced financial reporting
- automated governance workflows
- expanded communication features
- enhanced investment tracking
- reporting dashboards

---

## Maintainer

Project initiated and maintained by the Togba Family Legacy Initiative.
