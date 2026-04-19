const app = {
    state: {
        profiles: JSON.parse(localStorage.getItem('profiles') || '[]'),
        activeProfileIndex: null,
        editingProfileIndex: null,
        apiKey: localStorage.getItem('gemini_api_key') || '',
        model: (() => {
            const m = localStorage.getItem('gemini_model') || '';
            return (!m || m.includes('1.5') || m.includes('-latest')) ? 'gemini-2.5-flash' : m;
        })(),
        currentGeneratedPdfUrl: null,
        currentGeneratedPdfBlob: null,
        currentLatex: ''
    },

    async init() {
        try {
            await db.init();
            this.renderSavedResumes();
        } catch (e) {
            console.error('Failed to init DB', e);
        }

        this.renderProfiles();
        document.getElementById('profile-form').addEventListener('submit', (e) => this.handleProfileSubmit(e));
        if (this.state.apiKey) {
            document.getElementById('api-key').value = this.state.apiKey;
        }
        if (this.state.model) {
            document.getElementById('api-model').value = this.state.model;
        }
        
        // Add default rows for dynamic sections
        this.addDynamicRow('experience');
        this.addDynamicRow('education');
        this.addDynamicRow('projects');
        this.addDynamicRow('testScores');
        this.addDynamicRow('references');
        this.addDynamicRow('competencies');
        this.addDynamicRow('certifications');
        this.addDynamicRow('languages');
    },

    addDynamicRow(type, data = null) {
        const container = document.getElementById(`${type}-container`);
        const template = document.getElementById(`tpl-${type}`);
        const clone = template.content.cloneNode(true);
        const row = clone.querySelector('.dynamic-row');
        
        if (data) {
            const inputs = row.querySelectorAll('input, textarea');
            inputs.forEach(input => {
                const key = input.name.replace('[]', '').split('_')[1];
                if (data[key]) input.value = data[key];
            });
        }
        
        container.appendChild(clone);
        
        if (!data && container.children.length > 0) {
            const lastRow = container.lastElementChild;
            const firstInput = lastRow.querySelector('input');
            if (firstInput) firstInput.focus();
        }
    },

    removeDynamicRow(btn) {
        const row = btn.closest('.dynamic-row');
        row.remove();
    },

    handleDynamicEnter(e, type) {
        if (e.key === 'Enter') {
            e.preventDefault();
            this.addDynamicRow(type);
        }
    },

    toggleAccordion(header) {
        const content = header.nextElementSibling;
        const icon = header.querySelector('span');
        
        // Close others
        document.querySelectorAll('.accordion-content').forEach(c => {
            if (c !== content) c.classList.remove('active');
        });
        document.querySelectorAll('.accordion-header span').forEach(s => {
            if (s !== icon) s.innerText = '+';
        });

        // Toggle current
        content.classList.toggle('active');
        icon.innerText = content.classList.contains('active') ? '−' : '+';
    },

    showScreen(screenId, navEl = null) {
        // Hide all screens
        document.querySelectorAll('section').forEach(s => s.classList.add('hidden'));
        // Show target screen
        document.getElementById(`screen-${screenId}`).classList.remove('hidden');

        // Update nav UI
        if (navEl) {
            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            navEl.classList.add('active');
        }
    },

    switchTab(tabId) {
        document.querySelectorAll('.btn-tab').forEach(b => b.classList.remove('active'));
        document.getElementById(`tab-${tabId}`).classList.add('active');
        
        if (tabId === 'profiles') {
            document.getElementById('profile-list').classList.remove('hidden');
            document.getElementById('saved-resumes-list').classList.add('hidden');
        } else {
            document.getElementById('profile-list').classList.add('hidden');
            document.getElementById('saved-resumes-list').classList.remove('hidden');
        }
    },

    createNewProfile() {
        this.state.editingProfileIndex = null;
        const form = document.getElementById('profile-form');
        if (form) form.reset();
        
        ['experience', 'education', 'projects', 'testScores', 'references', 'competencies', 'certifications', 'languages'].forEach(type => {
            const container = document.getElementById(`${type}-container`);
            if (container) {
                container.innerHTML = '';
                this.addDynamicRow(type);
            }
        });
        
        document.querySelectorAll('.accordion-content').forEach(c => c.classList.remove('active'));
        document.querySelectorAll('.accordion-header span').forEach(s => s.innerText = '+');
        
        this.showScreen('profile-setup');
    },

    editProfile(index) {
        this.state.editingProfileIndex = index;
        const profile = this.state.profiles[index];
        
        // Reset and fill
        const form = document.getElementById('profile-form');
        if (form) form.reset();
        this.autoFillForm(profile);
        
        this.showScreen('profile-setup');
    },

    deleteProfile(index) {
        if (confirm('Are you sure you want to delete this profile?')) {
            this.state.profiles.splice(index, 1);
            localStorage.setItem('profiles', JSON.stringify(this.state.profiles));
            this.renderProfiles();
        }
    },

    handleProfileSubmit(e) {
        e.preventDefault();
        const formData = new FormData(e.target);
        const profile = {};
        
        for (const [key, value] of formData.entries()) {
            if (!key.endsWith('[]')) {
                profile[key] = value;
            }
        }
        
        const extractDynamic = (prefix, keys) => {
            const arr = [];
            const lists = {};
            keys.forEach(k => lists[k] = formData.getAll(`${prefix}_${k}[]`));
            
            const len = lists[keys[0]] ? lists[keys[0]].length : 0;
            for (let i = 0; i < len; i++) {
                const item = {};
                let hasData = false;
                keys.forEach(k => {
                    item[k] = lists[k][i] || '';
                    if (item[k].trim()) hasData = true;
                });
                if (hasData) arr.push(item);
            }
            return arr;
        };

        profile.experience = extractDynamic('exp', ['role', 'company', 'dates', 'achievements']);
        profile.education = extractDynamic('edu', ['institution', 'degree', 'score']);
        profile.projects = extractDynamic('proj', ['name', 'link', 'details']);
        profile.testScores = extractDynamic('test', ['name', 'score']);
        profile.references = extractDynamic('ref', ['name', 'title', 'contact']);
        profile.competencies = extractDynamic('comp', ['name']);
        profile.certifications = extractDynamic('cert', ['name']);
        profile.languages = extractDynamic('lang', ['name', 'prof']);
        
        if (this.state.editingProfileIndex !== null) {
            this.state.profiles[this.state.editingProfileIndex] = profile;
            this.state.editingProfileIndex = null;
        } else {
            this.state.profiles.push(profile);
        }
        
        localStorage.setItem('profiles', JSON.stringify(this.state.profiles));
        
        e.target.reset();
        
        ['experience', 'education', 'projects', 'testScores', 'references', 'competencies', 'certifications', 'languages'].forEach(type => {
            const container = document.getElementById(`${type}-container`);
            if (container) {
                container.innerHTML = '';
                this.addDynamicRow(type);
            }
        });

        this.renderProfiles();
        this.showScreen('dashboard');
    },

    renderProfiles() {
        const container = document.getElementById('profile-list');
        container.innerHTML = '';

        if (this.state.profiles.length === 0) {
            container.innerHTML = '<p class="dim" style="text-align:center; padding: 20px;">No profiles found. Create one to get started.</p>';
            return;
        }

        this.state.profiles.forEach((p, index) => {
            const div = document.createElement('div');
            div.className = 'glass-card profile-item';
            div.innerHTML = `
                <div class="profile-avatar">${p.fullName.charAt(0)}</div>
                <div style="flex:1">
                    <div style="font-weight:700">${p.fullName}</div>
                    <div class="dim" style="font-size:0.8rem">Resume Profile</div>
                </div>
                <div style="display: flex; gap: 10px;">
                    <button class="btn btn-secondary" style="width:auto; padding: 10px 15px; background: rgba(255,50,50,0.1); color: #ff5555; border: 1px solid rgba(255,50,50,0.3);" onclick="app.deleteProfile(${index})">Delete</button>
                    <button class="btn btn-secondary" style="width:auto; padding: 10px 15px;" onclick="app.editProfile(${index})">Edit</button>
                    <button class="btn btn-primary" style="width:auto; padding: 10px 15px;" onclick="app.startResumeGeneration(${index})">Use</button>
                </div>
            `;
            container.appendChild(div);
        });
    },

    async renderSavedResumes() {
        const container = document.getElementById('saved-resumes-list');
        if (!container) return;
        
        container.innerHTML = '';
        
        try {
            const resumes = await db.getAllResumes();
            if (resumes.length === 0) {
                container.innerHTML = '<p class="dim" style="text-align:center; padding: 20px;">No saved resumes found.</p>';
                return;
            }
            
            resumes.sort((a, b) => new Date(b.date) - new Date(a.date));
            
            resumes.forEach(r => {
                const div = document.createElement('div');
                div.className = 'glass-card profile-item';
                div.innerHTML = `
                    <div class="profile-avatar" style="background: rgba(139, 92, 246, 0.2);"><svg class="nav-icon" viewBox="0 0 24 24" style="color:var(--primary)"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8M16 17H8M10 9H8"/></svg></div>
                    <div style="flex:1">
                        <div style="font-weight:700">${r.name}</div>
                        <div class="dim" style="font-size:0.7rem">${new Date(r.date).toLocaleString()} • ${r.profileName}</div>
                    </div>
                    <div style="display: flex; gap: 5px;">
                        <button class="btn btn-secondary" style="width:auto; padding: 8px;" onclick="app.downloadSavedResume(${r.id})" title="Download"><svg class="nav-icon" style="width:16px;height:16px;" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg></button>
                        <button class="btn btn-secondary" style="width:auto; padding: 8px;" onclick="app.shareSavedResume(${r.id})" title="Share"><svg class="nav-icon" style="width:16px;height:16px;" viewBox="0 0 24 24"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13"/></svg></button>
                        <button class="btn btn-secondary" style="width:auto; padding: 8px; background: rgba(255,50,50,0.1); color: #ff5555; border-color: rgba(255,50,50,0.3);" onclick="app.deleteSavedResume(${r.id})" title="Delete">×</button>
                    </div>
                `;
                container.appendChild(div);
            });
        } catch (e) {
            console.error('Error rendering resumes:', e);
        }
    },

    startResumeGeneration(index) {
        this.state.activeProfileIndex = index;
        this.showScreen('jd-scanner');
    },

    saveSettings() {
        const key = document.getElementById('api-key').value;
        const model = document.getElementById('api-model').value;
        this.state.apiKey = key;
        this.state.model = model;
        localStorage.setItem('gemini_api_key', key);
        localStorage.setItem('gemini_model', model);
        alert('Settings Saved!');
    },

    async debugListModels() {
        if (!this.state.apiKey) return alert('Enter API Key first');
        const out = document.getElementById('debug-output');
        out.innerText = 'Listing models...';
        
        try {
            const res = await fetch(`https://generativelanguage.googleapis.com/v1/models?key=${this.state.apiKey}`);
            const data = await res.json();
            if (data.error) throw new Error(data.error.message);
            
            const modelNames = data.models.map(m => m.name.replace('models/', ''));
            out.innerHTML = 'Available models:<br>' + modelNames.join('<br>');
            console.log('Available Models:', modelNames);
        } catch (e) {
            out.innerText = 'Error listing models: ' + e.message;
        }
    },

    async handleResumeImport(input) {
        const file = input.files[0];
        if (!file) return;

        if (!this.state.apiKey) {
            alert('Please set your Gemini API key first.');
            return;
        }

        const statusEl = document.getElementById('import-status');
        statusEl.innerText = 'AI is reading your resume...';
        
        try {
            const base64 = await this.toBase64(file);
            const prompt = `
                Analyze this resume and extract all information into a JSON format.
                
                Return ONLY a JSON object with these flat keys (fill with empty string if not found):
                fullName, permanentAddress, currentAddress, phone1, phone2, email, linkedin, portfolio, citizenship, visaExpiry, summary, noticePeriod.
                
                For all other sections, return structured arrays of objects with exactly these keys:
                experience: [{role: "", company: "", dates: "", achievements: ""}]
                education: [{institution: "", degree: "", score: ""}]
                projects: [{name: "", link: "", details: ""}]
                testScores: [{name: "", score: ""}]
                references: [{name: "", title: "", contact: ""}]
                competencies: [{name: ""}]
                certifications: [{name: ""}]
                languages: [{name: "", prof: ""}]
            `;

            const mimeType = file.type === 'application/pdf' ? 'application/pdf' : 'image/jpeg';
            const jsonResponse = await this.fetchGemini(prompt, [base64.split(',')[1]], mimeType);
            
            // Extract JSON from response (handling potential markdown wrappers)
            const jsonString = jsonResponse.replace(/```json/g, '').replace(/```/g, '').trim();
            const data = JSON.parse(jsonString);

            this.autoFillForm(data);
            statusEl.innerText = 'Import Complete! Review the fields below.';
        } catch (error) {
            console.error(error);
            statusEl.innerText = 'Import Failed: ' + error.message;
        }
    },

    autoFillForm(data) {
        const form = document.getElementById('profile-form');
        for (const [key, value] of Object.entries(data)) {
            if (['experience', 'education', 'projects', 'testScores', 'references', 'competencies', 'certifications', 'languages'].includes(key)) {
                const container = document.getElementById(`${key}-container`);
                if (!container) continue;
                container.innerHTML = '';
                
                if (Array.isArray(value) && value.length > 0) {
                    value.forEach(item => this.addDynamicRow(key, item));
                } else if (typeof value === 'string' && value.trim()) {
                    const fallbackData = {};
                    if (key === 'experience') fallbackData.achievements = value;
                    if (key === 'education') fallbackData.institution = value;
                    if (key === 'projects') fallbackData.details = value;
                    if (key === 'testScores') fallbackData.name = value;
                    if (key === 'references') fallbackData.name = value;
                    if (key === 'competencies') fallbackData.name = value;
                    if (key === 'certifications') fallbackData.name = value;
                    if (key === 'languages') fallbackData.name = value;
                    this.addDynamicRow(key, fallbackData);
                } else {
                    this.addDynamicRow(key);
                }
                
                const content = container.closest('.accordion-content');
                if (content) {
                    content.classList.add('active');
                    const header = content.previousElementSibling;
                    if (header) header.querySelector('span').innerText = '−';
                }
            } else {
                const field = form.elements[key];
                if (field && value) {
                    if (typeof value === 'object') {
                        field.value = Array.isArray(value) ? value.join('\n') : JSON.stringify(value);
                    } else {
                        field.value = value;
                    }
                    
                    const content = field.closest('.accordion-content');
                    if (content) {
                        content.classList.add('active');
                        const header = content.previousElementSibling;
                        if (header) header.querySelector('span').innerText = '−';
                    }
                }
            }
        }
    },

    async generateResume() {
        const jdText = document.getElementById('jd-text').value;
        const jdFile = document.getElementById('jd-image').files[0];
        const profile = this.state.profiles[this.state.activeProfileIndex];

        if (!this.state.apiKey) {
            alert('Please add your Gemini API Key in Settings first.');
            this.showScreen('settings');
            return;
        }

        if (!jdText && !jdFile) {
            alert('Please provide a Job Description (text or image).');
            return;
        }

        this.showScreen('generation');
        const statusEl = document.getElementById('gen-status');

        try {
            let extractedJd = jdText;

            // Step 1: If image, extract text
            if (jdFile) {
                statusEl.innerText = 'Analyzing JD Image...';
                extractedJd = await this.extractTextFromImage(jdFile);
            }

            // Step 2: Generate LaTeX with Gemini
            statusEl.innerText = 'Tailoring Resume with AI...';
            const latexCode = await this.callGemini(profile, extractedJd);

            // Step 3: Convert LaTeX to PDF
            statusEl.innerText = 'Converting to PDF...';
            this.state.currentLatex = latexCode;
            const pdfData = await this.convertToPdf(latexCode);

            // Step 4: Show Result
            this.state.currentGeneratedPdfUrl = pdfData.url;
            this.state.currentGeneratedPdfBlob = pdfData.blob;
            
            // Set default name
            document.getElementById('result-filename').value = `${profile.fullName.replace(/\s+/g, '_')}_Resume`;

            this.showScreen('result');

        } catch (error) {
            console.error(error);
            alert('Error: ' + error.message);
            this.showScreen('dashboard');
        }
    },

    downloadResume() {
        const name = document.getElementById('result-filename').value || 'Resume';
        const link = document.createElement('a');
        link.href = this.state.currentGeneratedPdfUrl;
        link.download = `${name}.pdf`;
        link.click();
    },

    async shareResume() {
        const name = document.getElementById('result-filename').value || 'Resume';
        const blob = this.state.currentGeneratedPdfBlob;
        
        if (!blob) return alert('No generated PDF found.');

        const file = new File([blob], `${name}.pdf`, { type: 'application/pdf' });
        
        if (navigator.share && navigator.canShare({ files: [file] })) {
            try {
                await navigator.share({
                    files: [file],
                    title: name,
                    text: 'Here is my generated resume.'
                });
            } catch (error) {
                console.error('Share failed', error);
            }
        } else {
            alert('Web Share API is not supported on this browser/device, or sharing files is not allowed.');
        }
    },

    async saveResumeToDb() {
        const name = document.getElementById('result-filename').value || 'Resume';
        const blob = this.state.currentGeneratedPdfBlob;
        const profileName = this.state.profiles[this.state.activeProfileIndex].fullName;
        
        try {
            await db.saveResume(name, blob, profileName);
            alert('Resume saved to your dashboard!');
            this.renderSavedResumes();
            this.switchTab('resumes');
            this.showScreen('dashboard');
        } catch (e) {
            alert('Failed to save resume: ' + e);
        }
    },

    async downloadSavedResume(id) {
        const resumes = await db.getAllResumes();
        const r = resumes.find(x => x.id === id);
        if (r) {
            const url = URL.createObjectURL(r.blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${r.name}.pdf`;
            link.click();
            URL.revokeObjectURL(url);
        }
    },

    async shareSavedResume(id) {
        const resumes = await db.getAllResumes();
        const r = resumes.find(x => x.id === id);
        if (r) {
            const file = new File([r.blob], `${r.name}.pdf`, { type: 'application/pdf' });
            if (navigator.share && navigator.canShare({ files: [file] })) {
                try {
                    await navigator.share({
                        files: [file],
                        title: r.name,
                        text: 'Here is my resume.'
                    });
                } catch (error) {
                    console.error('Share failed', error);
                }
            } else {
                alert('Web Share API is not supported on this browser/device.');
            }
        }
    },

    async deleteSavedResume(id) {
        if (confirm('Delete this saved resume?')) {
            await db.deleteResume(id);
            this.renderSavedResumes();
        }
    },

    async extractTextFromImage(file) {
        const base64 = await this.toBase64(file);
        const prompt = "Extract all relevant job requirements, skills, and responsibilities from this job description image. Return only the text.";
        
        const response = await this.fetchGemini(prompt, [base64.split(',')[1]]);
        return response;
    },

    async callGemini(profile, jd) {
        const prompt = `
            You are an expert resume writer. Create a professional LaTeX resume using the specific structure of the provided sample.
            
            USER PROFILE DATA:
            Name: ${profile.fullName}
            Address: ${profile.permanentAddress} / ${profile.currentAddress}
            Contact: ${profile.email} | ${profile.phone1} ${profile.phone2 ? '/ ' + profile.phone2 : ''}
            LinkedIn/Portfolio: ${profile.linkedin} | ${profile.portfolio}
            Summary: ${profile.summary}
            Core Competencies: ${typeof profile.competencies === 'string' ? profile.competencies : JSON.stringify(profile.competencies, null, 2)}
            Experience: ${typeof profile.experience === 'string' ? profile.experience : JSON.stringify(profile.experience, null, 2)}
            Education: ${typeof profile.education === 'string' ? profile.education : JSON.stringify(profile.education, null, 2)}
            Projects: ${typeof profile.projects === 'string' ? profile.projects : JSON.stringify(profile.projects, null, 2)}
            Test Scores: ${typeof profile.testScores === 'string' ? profile.testScores : JSON.stringify(profile.testScores, null, 2)}
            References: ${typeof profile.references === 'string' ? profile.references : JSON.stringify(profile.references, null, 2)}
            Languages: ${typeof profile.languages === 'string' ? profile.languages : JSON.stringify(profile.languages, null, 2)}
            Certifications: ${typeof profile.certifications === 'string' ? profile.certifications : JSON.stringify(profile.certifications, null, 2)}
            Other Info: ${profile.noticePeriod}, ${profile.relocation}, ${profile.workFormat}

            TARGET JOB DESCRIPTION:
            ${jd}

            LATEX STRUCTURE REQUIREMENTS (Strictly follow this order):
            1. HEADER: Name (Large, Centered), Address, Mobile, Email (links).
            2. PROFESSIONAL SUMMARY: Paragraph summarizing 10+ years (or relevant) experience.
            3. CORE COMPETENCIES: Bulleted list of key skills tailored to JD.
            4. PROFESSIONAL EXPERIENCE: For each role, list Title - Company, Duration (on right). Underneath, bulleted points of achievements using impact metrics (%, $, time).
            5. EDUCATION: Bulleted list of degrees, institutions, and years.
            6. RELEVANT STRENGTHS: Bulleted list of soft skills and domain expertise.
            7. ADDITIONAL INFORMATION: Languages, availability, relocation, and other logistics.

            FORMATTING AND CONTENT RULES:
            - If any sections in the user profile (e.g. Summary, Core Competencies, Experience bullet points) are missing or sparse, you MUST proactively generate and fill them in the final resume to perfectly match the TARGET JOB DESCRIPTION.
            - Tailor and rewrite existing experience and skills to highlight relevance to the target role.
            - Use ONLY standard LaTeX packages (article, geometry, hyperref, enumitem).
            - Output ONLY the LaTeX code. No markdown formatting.
            - Ensure high-density keywords for ATS optimization.
        `;

        let response = await this.fetchGemini(prompt);
        response = response.replace(/```latex/g, '').replace(/```/g, '').trim();
        return response;
    },

    async fetchGemini(prompt, images = [], mimeType = "image/jpeg") {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.state.model}:generateContent?key=${this.state.apiKey}`;
        
        const contents = [{
            parts: [{ text: prompt }]
        }];

        if (images.length > 0) {
            images.forEach(img => {
                contents[0].parts.push({
                    inline_data: {
                        mime_type: mimeType,
                        data: img
                    }
                });
            });
        }

        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents })
        });

        const data = await res.json();
        if (data.error) throw new Error(data.error.message);
        return data.candidates[0].content.parts[0].text;
    },

    async convertToPdf(latex) {
        // We use latex-on-http API which supports POST requests, avoiding URI length limits
        const url = 'https://latex.ytotech.com/builds/sync';
        
        const payload = {
            compiler: "pdflatex",
            resources: [
                {
                    main: true,
                    content: latex
                }
            ]
        };

        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (!res.ok) {
            // Provide a fallback option in the error if PDF generation fails so user can save the LaTeX code
            console.error(await res.text());
            throw new Error('LaTeX conversion service failed. Try again or copy the LaTeX syntax manually.');
        }
        
        const blob = await res.blob();
        return {
            url: URL.createObjectURL(blob),
            blob: blob
        };
    },

    toBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result);
            reader.onerror = error => reject(error);
        });
    }
};

app.init();
