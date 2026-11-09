/**
 * config/swagger.js
 * CESS DocuFlow OpenAPI 3.0.0 Specification
 * Provides interactive API documentation and schemas for Frontend integration and testing.
 */

const swaggerSpec = {
  openapi: '3.0.0',
  info: {
    title: 'CESS DocuFlow REST API',
    version: '1.0.0',
    description: `
**Web-Based Document Management and Tracking System**
College of Education and Social Sciences (CESS) & Integrated Developmental School (MSUN-IDS)
Mindanao State University at Naawan

### How to use this documentation:
1. **Authenticate**: Click the **Authorize 🔓** button below and enter your JWT token (\`Bearer <token>\`) or log in via \`POST /api/auth/login\` to get a token.
2. **Test Endpoints**: Expand any endpoint below and click **Try it out** to execute real requests against the backend.
3. **Role Enforcement**:
   - **Student / Faculty**: Document submissions (\`POST /api/documents\`), tracking, resubmission.
   - **College Secretary**: Completeness checks (\`/check\`), workstation queues (\`/queues\`), document types configuration, route sequence administration.
   - **Reviewers (Chairperson, Dean, IDS Principal, OVCAA, Chancellor)**: Endorsements & approvals (\`/review\`), returns (\`/return\`), rejections (\`/reject\`).
    `,
    contact: {
      name: 'CESS DocuFlow Development Team',
      email: 'cess.docuflow@msunaawan.edu.ph',
    },
  },
  servers: [
    {
      url: 'http://localhost:5000',
      description: 'Local Development Server',
    },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Provide a valid JWT token obtained from POST /api/auth/login or POST /api/auth/google',
      },
    },
    schemas: {
      ErrorResponse: {
        type: 'object',
        properties: {
          error: {
            type: 'string',
            example: 'Forbidden: Role \'Student\' is not permitted to perform \'check_requirements\'.',
          },
        },
      },
      LoginRequest: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: {
            type: 'string',
            format: 'email',
            example: 'secretary@msunaawan.edu.ph',
          },
          password: {
            type: 'string',
            format: 'password',
            example: 'secretary123',
          },
          rememberMe: {
            type: 'boolean',
            example: true,
            description: 'PB-04: Optional Remember-me keeping active session for 7 days',
          },
        },
      },
      LoginResponse: {
        type: 'object',
        properties: {
          message: { type: 'string', example: 'Login successful.' },
          token: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
          user: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              name: { type: 'string', example: 'Ms. Carmela Ortiz' },
              email: { type: 'string', example: 'secretary@msunaawan.edu.ph' },
              role: { type: 'string', example: 'secretary' },
              roleLabel: { type: 'string', example: 'College Secretary' },
              origin: { type: 'string', example: 'CESS' },
              department: { type: 'string', example: 'Office of the College Secretary' },
            },
          },
        },
      },
      DocumentSubmissionRequest: {
        type: 'object',
        required: ['title', 'docTypeId'],
        properties: {
          title: { type: 'string', example: 'Application for Completion of INC in Ed 101' },
          description: { type: 'string', example: 'Completing incomplete grade under Prof. Cruz.' },
          docTypeId: { type: 'integer', example: 1, description: 'Document type ID (1: INC, 2: Add/Drop, 3: Graduation, 4: Leave, 5: Travel Order, 6: Clearance)' },
          origin: { type: 'string', enum: ['CESS', 'IDS'], example: 'CESS' },
          attachments: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string', example: 'INC_Completion_Form.pdf' },
                url: { type: 'string', example: '/uploads/sample_inc.pdf' },
                sizeKb: { type: 'number', example: 250 },
                type: { type: 'string', example: 'application/pdf' },
                formId: { type: 'string', example: 'req-1' },
              },
            },
          },
        },
      },
      CompletenessCheckRequest: {
        type: 'object',
        required: ['decision'],
        properties: {
          decision: {
            type: 'string',
            enum: ['complete', 'return', 'reject'],
            example: 'complete',
            description: '\'complete\' routes to next office; \'return\' returns to student for revision; \'reject\' closes request.',
          },
          remarks: { type: 'string', example: 'All required clearance forms and signatures verified.' },
          nextOfficeName: { type: 'string', example: 'Department Chairperson' },
        },
      },
      ReviewDecisionRequest: {
        type: 'object',
        required: ['action'],
        properties: {
          action: {
            type: 'string',
            enum: ['endorse', 'approve', 'return', 'reject'],
            example: 'endorse',
            description: '\'endorse\' passes to next office; \'approve\' provides final approval; \'return\' sends back with remarks; \'reject\' disapproves.',
          },
          remarks: { type: 'string', example: 'Recommending approval. Academic requirements satisfied.' },
          nextOfficeName: { type: 'string', example: 'College Dean' },
        },
      },
      ReturnRequest: {
        type: 'object',
        required: ['reason'],
        properties: {
          reason: { type: 'string', example: 'Please attach the official assessment receipt from the Cashier.' },
          remarks: { type: 'string', example: 'Missing assessment receipt.' },
        },
      },
      RejectRequest: {
        type: 'object',
        required: ['reason'],
        properties: {
          reason: { type: 'string', example: 'Exceeded the maximum 1-year residency policy for INC completion.' },
        },
      },
      ResubmitRequest: {
        type: 'object',
        properties: {
          resubmission_remarks: { type: 'string', example: 'Uploaded the missing official receipt as requested.' },
          attachments: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string', example: 'Official_Receipt_Cashier.pdf' },
                url: { type: 'string', example: '/uploads/receipt_v2.pdf' },
                sizeKb: { type: 'number', example: 180 },
              },
            },
          },
        },
      },
      DocumentTypeCreateRequest: {
        type: 'object',
        required: ['name', 'origin'],
        properties: {
          name: { type: 'string', example: 'Certificate of Good Moral Character' },
          origin: { type: 'string', enum: ['CESS', 'IDS'], example: 'CESS' },
          audience: { type: 'string', enum: ['student', 'faculty', 'all'], example: 'student' },
          processingDays: { type: 'integer', example: 3 },
          description: { type: 'string', example: 'Official college moral character certificate issued by Dean Office.' },
          templateUrl: { type: 'string', example: '/templates/Good_Moral_Template.pdf' },
          requirements: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                form_name: { type: 'string', example: 'Barangay Clearance Copy' },
                is_required: { type: 'boolean', example: true },
                source_office: { type: 'string', example: 'Local Barangay Hall' },
              },
            },
          },
        },
      },
      WorkflowRouteUpdateRequest: {
        type: 'object',
        required: ['sequence'],
        properties: {
          sequence: {
            type: 'array',
            items: { type: 'string' },
            example: ['College Secretary', 'Department Chairperson', 'College Dean', 'College Secretary'],
            description: 'Ordered office sequence. Must start and end with College Secretary.',
          },
          reason: { type: 'string', example: 'Institutional procedural update approved by College Council.' },
        },
      },
    },
  },
  tags: [
    { name: 'Auth', description: 'Authentication, Google SSO & Registration' },
    { name: 'Documents', description: 'Document request lifecycle, listing, details & timeline' },
    { name: 'Secretary Workstation', description: 'Completeness checking, queues, user whitelist & approvals' },
    { name: 'Reviewer Decisions', description: 'Office endorsement, final approval, returning & rejection' },
    { name: 'Document Types', description: 'Administrative document types, requirements checklist & templates (PB-44)' },
    { name: 'Workflow Routes', description: 'Office sequence configuration, CESS vs IDS routing & audit logs (PB-45)' },
  ],
  paths: {
    '/api/health': {
      get: {
        summary: 'System health check',
        tags: ['Auth'],
        responses: {
          200: {
            description: 'Server status and service check',
          },
        },
      },
    },

    // --- AUTHENTICATION ---
    '/api/auth/login': {
      post: {
        summary: 'Log in with university email and password',
        tags: ['Auth'],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginRequest' } } },
        },
        responses: {
          200: { description: 'Authenticated successfully', content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginResponse' } } } },
          401: { description: 'Invalid credentials', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/auth/google': {
      post: {
        summary: 'Log in via Google OAuth (@msunaawan.edu.ph domain enforced)',
        tags: ['Auth'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email'],
                properties: {
                  email: { type: 'string', format: 'email', example: 'student@msunaawan.edu.ph' },
                  name: { type: 'string', example: 'Maria Santos' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Google login successful', content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginResponse' } } } },
          403: { description: 'Non-MSUN email rejected' },
        },
      },
    },
    '/api/auth/register': {
      post: {
        summary: 'Register a new account (subject to whitelist verification)',
        tags: ['Auth'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password', 'firstName', 'lastName'],
                properties: {
                  email: { type: 'string', format: 'email', example: 'newstudent@msunaawan.edu.ph' },
                  password: { type: 'string', example: 'Pass1234!' },
                  firstName: { type: 'string', example: 'Juan' },
                  lastName: { type: 'string', example: 'Dela Cruz' },
                  idNumber: { type: 'string', example: '2023-0123' },
                  role: { type: 'string', example: 'student' },
                  origin: { type: 'string', enum: ['CESS', 'IDS'], example: 'CESS' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Registered or pending secretary approval' },
          400: { description: 'Validation error' },
        },
      },
    },
    '/api/auth/logout': {
      post: {
        summary: 'Log out and invalidate the active session (PB-04)',
        tags: ['Auth'],
        security: [{ BearerAuth: [] }],
        responses: {
          200: {
            description: 'Session terminated and logged out successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    message: { type: 'string', example: 'Logged out successfully. Session terminated.' },
                  },
                },
              },
            },
          },
          401: { description: 'Missing or invalid session credentials' },
        },
      },
    },
    '/api/auth/me': {
      get: {
        summary: 'Get currently authenticated user session and role profile',
        tags: ['Auth'],
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'User profile retrieved' },
          401: { description: 'Unauthorized' },
        },
      },
    },

    // --- DOCUMENTS (CORE LIFECYCLE) ---
    '/api/documents': {
      get: {
        summary: 'List documents (Role-filtered: Requester sees own, Reviewer sees routed, Secretary sees all)',
        tags: ['Documents'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'status', in: 'query', schema: { type: 'string' }, description: 'Filter by status (Submitted, Under_Review, Returned, Rejected, Released)' },
          { name: 'origin', in: 'query', schema: { type: 'string', enum: ['CESS', 'IDS'] } },
          { name: 'search', in: 'query', schema: { type: 'string' } },
          { name: 'queue', in: 'query', schema: { type: 'string' }, description: 'PB-20: Filter by workstation queue' },
          { name: 'stage', in: 'query', schema: { type: 'string' }, description: 'PB-28: Filter by lifecycle stage (awaiting_verification, in_review, ready_for_release, returned, rejected, released)' },
          { name: 'office', in: 'query', schema: { type: 'string' }, description: 'PB-28: Filter by current holding office name (e.g. chairperson, dean, secretary)' },
          { name: 'officeId', in: 'query', schema: { type: 'integer' }, description: 'PB-28: Filter by current holding office ID' },
          { name: 'overdue', in: 'query', schema: { type: 'boolean' }, description: 'PB-28: Filter documents exceeding standard turnaround time' },
          { name: 'sort', in: 'query', schema: { type: 'string', enum: ['oldest', 'newest', 'waiting_longest'], default: 'oldest' }, description: 'PB-29: Queue ordering (default oldest eligible first / FIFO per SRS 3.9)' },
          { name: 'priority', in: 'query', schema: { type: 'string', enum: ['Urgent', 'Standard'] }, description: 'PB-29: Filter by priority' },
          { name: 'is_expedited', in: 'query', schema: { type: 'boolean' }, description: 'PB-29: Filter approved expedited exception requests only' },
        ],
        responses: {
          200: { description: 'List of accessible document requests' },
          401: { description: 'Unauthorized' },
        },
      },
      post: {
        summary: 'Submit a new document request (Students, CESS Faculty, IDS Faculty)',
        tags: ['Documents'],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/DocumentSubmissionRequest' } } },
        },
        responses: {
          201: { description: 'Document request submitted successfully' },
          400: { description: 'Missing required fields' },
          403: { description: 'Role not permitted to submit document or type mismatch' },
        },
      },
    },
    '/api/documents/{id}': {
      get: {
        summary: 'Get single document details, current office, waiting time, and permitted actions',
        tags: ['Documents'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'Document UUID' }],
        responses: {
          200: { description: 'Document details with normalized timeline and office' },
          403: { description: 'Forbidden: Requester cannot view other users documents' },
          404: { description: 'Document not found' },
        },
      },
      put: {
        summary: 'Edit a returned document (PB-18: editing blocked while in routing, permitted only if Returned)',
        tags: ['Documents'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  description: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Document updated' },
          403: { description: 'Forbidden: Document cannot be edited while in routing' },
        },
      },
    },
    '/api/documents/{id}/actions': {
      get: {
        summary: 'Get permitted actions for the calling user on this document at this stage (PB-24)',
        tags: ['Reviewer Decisions'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Permitted action options (e.g., endorse, approve, return, reject)' },
        },
      },
    },
    '/api/documents/{id}/history': {
      get: {
        summary: 'Get chronological audit timeline milestones and handoff history (PB-26, PB-48)',
        tags: ['Documents'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Chronological timeline history (immutable, verified)' },
        },
      },
    },
    '/api/documents/{id}/route': {
      get: {
        summary: 'Get configured workflow route, step progression, and document snapshot sequence (PB-25, PB-45)',
        tags: ['Workflow Routes'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Route progression and active snapshot sequence' },
        },
      },
    },
    '/api/documents/{id}/attachments': {
      get: {
        summary: 'Get versioned document attachments (PB-49 access protected)',
        tags: ['Documents'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'List of attachments for this document' },
          403: { description: 'Forbidden: Caller not authorized to view attachments' },
        },
      },
    },

    // --- SECRETARY WORKSTATION & GATES ---
    '/api/documents/{id}/check': {
      post: {
        summary: 'Perform completeness check and initial routing (College Secretary only - PB-20, PB-22)',
        tags: ['Secretary Workstation'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/CompletenessCheckRequest' } } },
        },
        responses: {
          200: { description: 'Completeness check recorded; document routed to first reviewing office' },
          403: { description: 'Forbidden: Only College Secretary can perform completeness check' },
        },
      },
    },
    '/api/documents/{id}/flag-exception': {
      post: {
        summary: 'Flag approved exception for expedited queue priority (PB-29, SRS 3.9)',
        tags: ['Reviewer Decisions'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['reason'],
                properties: {
                  reason: { type: 'string', example: 'Graduation clearance deadline: Registrar requires immediate endorsement.' },
                  priority: { type: 'string', enum: ['Urgent', 'Standard'], default: 'Urgent' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Approved exception flagged and prioritized in FIFO queue' },
          400: { description: 'Missing required reason' },
          403: { description: 'Forbidden: Requires Secretary or Reviewer role' },
          404: { description: 'Document not found' },
        },
      },
    },
    '/api/documents/workflow-map': {
      get: {
        summary: 'Get Secretary visual workflow map, live office counts, and bottleneck analysis (PB-28, SRS 3.11)',
        tags: ['Secretary Workstation'],
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Institutional workflow map with zero double-counting office & stage counts, overdue metrics, and active route topologies' },
          401: { description: 'Unauthorized' },
          403: { description: 'Forbidden: Requires Secretary or Reviewer role' },
        },
      },
    },
    '/api/documents/queues': {
      get: {
        summary: 'Get Secretary workstation 6-queue categorization and exact counts (PB-20)',
        tags: ['Secretary Workstation'],
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Queues: intake, routed, returned, external, release, archived with counts' },
          403: { description: 'Forbidden: Secretary access only' },
        },
      },
    },

    // --- REVIEWER DECISIONS ---
    '/api/documents/{id}/review': {
      post: {
        summary: 'Record office decision (Endorse, Final Approve, Return, or Reject - PB-24, PB-25)',
        tags: ['Reviewer Decisions'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ReviewDecisionRequest' } } },
        },
        responses: {
          200: { description: 'Decision recorded and document routed to next office' },
          400: { description: 'Invalid transition or bypass attempt (e.g. skipping IDS Principal)' },
          403: { description: 'Forbidden: Out-of-turn action or unauthorized role' },
        },
      },
    },
    '/api/documents/{id}/return': {
      post: {
        summary: 'Return document for student/faculty revision with mandatory reason (PB-22)',
        tags: ['Reviewer Decisions'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ReturnRequest' } } },
        },
        responses: {
          200: { description: 'Document returned; notification dispatched' },
          400: { description: 'Missing required return reason' },
        },
      },
    },
    '/api/documents/{id}/reject': {
      post: {
        summary: 'Disapprove / reject document request with mandatory reason (PB-23)',
        tags: ['Reviewer Decisions'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/RejectRequest' } } },
        },
        responses: {
          200: { description: 'Document marked Rejected; normal routing halted' },
          400: { description: 'Missing required rejection reason' },
        },
      },
    },
    '/api/documents/{id}/resubmit': {
      post: {
        summary: 'Resubmit returned document with Revision 2 and corrected files (PB-19)',
        tags: ['Documents'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ResubmitRequest' } } },
        },
        responses: {
          200: { description: 'Document resubmitted under Revision 2 and routed back to Secretary queue' },
          400: { description: 'Document is not in Returned state' },
        },
      },
    },

    // --- DOCUMENT TYPES & TEMPLATES (PB-44) ---
    '/api/document-types': {
      get: {
        summary: 'List available document types and checklists (Filtered by user role & origin - PB-10, PB-44)',
        tags: ['Document Types'],
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Array of active document types' },
        },
      },
      post: {
        summary: 'Create a new document type with checklists & SLA days (Admin/Secretary - PB-44)',
        tags: ['Document Types'],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/DocumentTypeCreateRequest' } } },
        },
        responses: {
          201: { description: 'Document type created' },
          403: { description: 'Forbidden: Only College Secretary can manage document types' },
        },
      },
    },
    '/api/document-types/{id}': {
      get: {
        summary: 'Get document type details, requirements, and turnaround days',
        tags: ['Document Types'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Document type details' },
        },
      },
      put: {
        summary: 'Update document type metadata, SLA days, or audience (Admin/Secretary - PB-44)',
        tags: ['Document Types'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  processingDays: { type: 'integer' },
                  description: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Document type updated' },
        },
      },
      delete: {
        summary: 'Soft-deactivate document type (Hides from dropdowns, preserves existing requests - PB-44)',
        tags: ['Document Types'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Document type deactivated (is_active: false)' },
        },
      },
    },
    '/api/document-types/{id}/template': {
      get: {
        summary: 'Get downloadable official blank form template URL (PB-44)',
        tags: ['Document Types'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Template URL info' },
        },
      },
      put: {
        summary: 'Replace official blank form template (Admin/Secretary - PB-44)',
        tags: ['Document Types'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['templateUrl'],
                properties: {
                  templateUrl: { type: 'string', example: '/templates/INC_Form_Template_v2.pdf' },
                  fileName: { type: 'string', example: 'INC_Form_Template_v2.pdf' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Template replaced successfully' },
        },
      },
    },

    // --- WORKFLOW ROUTES CONFIGURATION (PB-45) ---
    '/api/workflow/routes': {
      get: {
        summary: 'Get approved workflow route sequences for CESS and IDS (PB-45)',
        tags: ['Workflow Routes'],
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Active route sequences and version numbers' },
        },
      },
    },
    '/api/workflow/routes/{origin}': {
      put: {
        summary: 'Update approved office sequence with validation & versioning (PB-45)',
        tags: ['Workflow Routes'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'origin', in: 'path', required: true, schema: { type: 'string', enum: ['CESS', 'IDS'] } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/WorkflowRouteUpdateRequest' } } },
        },
        responses: {
          200: { description: 'Route updated to new version; in-flight requests retain snapshot (Migration Rule)' },
          400: { description: 'Invalid sequence (must start/end with Secretary, no duplicate adjacent offices)' },
          403: { description: 'Forbidden: Only College Secretary can configure routes' },
        },
      },
    },
    '/api/notifications': {
      get: {
        summary: 'List in-system notifications with related request details (PB-06)',
        tags: ['Notifications'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'unread', in: 'query', schema: { type: 'boolean' }, description: 'Filter unread only' },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } },
          { name: 'documentId', in: 'query', schema: { type: 'string' }, description: 'Filter by document ID' },
        ],
        responses: {
          200: { description: 'User notifications list with unreadCount and relatedRequest links' },
          401: { description: 'Unauthorized' },
        },
      },
    },
    '/api/notifications/unread-count': {
      get: {
        summary: 'Get total unread in-system notifications count for navigation badge (PB-06)',
        tags: ['Notifications'],
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Unread notifications count' },
          401: { description: 'Unauthorized' },
        },
      },
    },
    '/api/notifications/{id}/read': {
      patch: {
        summary: 'Mark single notification as read (PB-06)',
        tags: ['Notifications'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Notification marked as read' },
          403: { description: 'Forbidden: Cannot mark another user notification' },
          404: { description: 'Notification not found' },
        },
      },
    },
    '/api/notifications/mark-all-read': {
      post: {
        summary: 'Mark all unread notifications as read for current user (PB-06)',
        tags: ['Notifications'],
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'All notifications marked as read' },
          401: { description: 'Unauthorized' },
        },
      },
    },
    '/api/notifications/clear-read': {
      delete: {
        summary: 'Clear all read notifications from personal inbox (PB-06 PO Note)',
        tags: ['Notifications'],
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'All read notifications cleared from inbox' },
          401: { description: 'Unauthorized' },
        },
      },
    },
    '/api/notifications/{id}': {
      delete: {
        summary: 'Clear single notification from personal inbox (PB-06 PO Note)',
        tags: ['Notifications'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Notification cleared from inbox' },
          403: { description: 'Forbidden: Cannot clear another user notification' },
          404: { description: 'Notification not found' },
        },
      },
    },
    '/api/notifications/preferences': {
      get: {
        summary: 'Get user notification delivery preferences (PB-05)',
        tags: ['Notifications'],
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'User notification delivery preference' },
        },
      },
      put: {
        summary: 'Update notification delivery preferences (PB-05)',
        tags: ['Notifications'],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  preference: { type: 'string', enum: ['both', 'email_only', 'in_system_only'] },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Preference updated successfully' },
        },
      },
    },
    '/api/workflow/routes/history': {
      get: {
        summary: 'Get chronological audit log of route sequence modifications (PB-45)',
        tags: ['Workflow Routes'],
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Full history of route changes with reasons and actor details' },
        },
      },
    },
  },
};

module.exports = swaggerSpec;
