let isHighlighting = false;
let isErasing = false;
let isCommenting = false;
let currentColor = 'yellow';
let pdfUrl = '';
let mouseX = 0;
let mouseY = 0;
let activeCommentPopup = null;
let commentPreviewTimeout = null;

document.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
});

// Constants and utilities
const TOOLS = {
    highlight: {
        id: 'highlight-btn',
        colors: ['yellow', 'greenyellow', 'cyan', 'magenta', 'red']
    },
    draw: {
        id: 'draw-btn',
        colors: ['white', 'black', 'red', 'green', 'blue']
    },
    text: {
        id: 'text-btn',
        colors: ['white', 'black', 'red', 'green', 'blue']
    },
    comment: {
        id: 'comment-btn',
        colors: ['blue', 'green', 'orange', 'purple', 'red'],
        defaultColor: '#4374E0'
    }
};

class ColorPickerManager {
    constructor() {
        this.activeTools = {
            isHighlighting: false,
            isDrawing: false,
            isTexting: false,
            isCommenting: false,
            isErasing: false
        };
        this.currentColors = {
            highlight: TOOLS.highlight.colors[0],
            draw: TOOLS.draw.colors[0],
            text: TOOLS.text.colors[0],
            comment: TOOLS.comment.colors[0]
        };
        
        // Custom colors for each tool
        this.customColors = {
            highlight: '#FF4500', // Default custom color - orange red
            draw: '#8A2BE2',      // Default custom color - blue violet
            text: '#20B2AA',      // Default custom color - light sea green
            comment: TOOLS.comment.defaultColor // Default comment color
        };
        
        // Current HSV values for each tool
        this.hsvValues = {
            highlight: { h: 16, s: 100, v: 100 },  // Orange-red
            draw: { h: 271, s: 76, v: 74 },        // Blue-violet
            text: { h: 174, s: 81, v: 70 },        // Light sea green
            comment: { h: 220, s: 70, v: 88 }      // Blue for comments
        };
        
        // Flags for the color picker drag operations
        this.isDraggingHue = false;
        this.isDraggingSV = false;
        this.activePickerTool = null;
        
        // Add history stacks for undo/redo
        this.undoStack = [];
        this.redoStack = [];
        
        // Add global event listeners for drag operations
        document.addEventListener('mousemove', this.handleMouseMove.bind(this));
        document.addEventListener('mouseup', this.handleMouseUp.bind(this));
        
        // Set up keyboard shortcuts
        this.setupKeyboardShortcuts();
    }
    
    // Convert HSV to RGB
    hsvToRgb(h, s, v) {
        s = s / 100;
        v = v / 100;
        
        let r, g, b;
        const i = Math.floor(h / 60);
        const f = h / 60 - i;
        const p = v * (1 - s);
        const q = v * (1 - f * s);
        const t = v * (1 - (1 - f) * s);
        
        switch (i % 6) {
            case 0: r = v; g = t; b = p; break;
            case 1: r = q; g = v; b = p; break;
            case 2: r = p; g = v; b = t; break;
            case 3: r = p; g = q; b = v; break;
            case 4: r = t; g = p; b = v; break;
            case 5: r = v; g = p; b = q; break;
        }
        
        return {
            r: Math.round(r * 255),
            g: Math.round(g * 255),
            b: Math.round(b * 255)
        };
    }
    
    // Convert RGB to Hex
    rgbToHex(r, g, b) {
        return '#' + [r, g, b].map(c => {
            const hex = c.toString(16);
            return hex.length === 1 ? '0' + hex : hex;
        }).join('');
    }
    
    // Convert Hex to RGB
    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : null;
    }
    
    // Convert RGB to HSV
    rgbToHsv(r, g, b) {
        r /= 255;
        g /= 255;
        b /= 255;
        
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        let h, s, v = max;
        
        const d = max - min;
        s = max === 0 ? 0 : d / max;
        
        if (max === min) {
            h = 0; // achromatic
        } else {
            switch (max) {
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4; break;
            }
            h /= 6;
        }
        
        return {
            h: Math.round(h * 360),
            s: Math.round(s * 100),
            v: Math.round(v * 100)
        };
    }
    
    // Handle mouse move for dragging operations
    handleMouseMove(e) {
        if (!this.isDraggingHue && !this.isDraggingSV || !this.activePickerTool) return;
        
        const toolType = this.activePickerTool;
        const picker = document.getElementById(`${toolType}-color-picker`);
        
        if (this.isDraggingHue) {
            const hueSlider = picker.querySelector('.hue-slider');
            const rect = hueSlider.getBoundingClientRect();
            let x = e.clientX - rect.left;
            
            // Constrain to the slider width
            x = Math.max(0, Math.min(rect.width, x));
            
            // Calculate hue value (0-360)
            const hue = Math.round((x / rect.width) * 360);
            this.hsvValues[toolType].h = hue;
            
            // Update the hue slider handle position
            const handle = hueSlider.querySelector('.hue-slider-handle');
            handle.style.left = `${x}px`;
            
            // Update the saturation-value picker background color
            const svPicker = picker.querySelector('.saturation-value-picker');
            const hueColor = this.rgbToHex(
                ...Object.values(this.hsvToRgb(hue, 100, 100))
            );
            svPicker.style.backgroundColor = hueColor;
            
            this.updateColorFromHsv(toolType);
        }
        
        if (this.isDraggingSV) {
            const svPicker = picker.querySelector('.saturation-value-picker');
            const rect = svPicker.getBoundingClientRect();
            let x = e.clientX - rect.left;
            let y = e.clientY - rect.top;
            
            // Constrain to the picker area
            x = Math.max(0, Math.min(rect.width, x));
            y = Math.max(0, Math.min(rect.height, y));
            
            // Calculate saturation and value
            const s = Math.round((x / rect.width) * 100);
            const v = Math.round(100 - (y / rect.height) * 100);
            
            this.hsvValues[toolType].s = s;
            this.hsvValues[toolType].v = v;
            
            // Update the handle position
            const handle = svPicker.querySelector('.picker-handle');
            handle.style.left = `${x}px`;
            handle.style.top = `${y}px`;
            
            this.updateColorFromHsv(toolType);
        }
    }
    
    // Handle mouse up to end drag operations
    handleMouseUp() {
        this.isDraggingHue = false;
        this.isDraggingSV = false;
    }
    
    // Update color based on current HSV values
    updateColorFromHsv(toolType) {
        const hsv = this.hsvValues[toolType];
        const rgb = this.hsvToRgb(hsv.h, hsv.s, hsv.v);
        const hex = this.rgbToHex(rgb.r, rgb.g, rgb.b);
        
        // Update the custom color
        this.customColors[toolType] = hex;
        
        // Update the picker UI
        const picker = document.getElementById(`${toolType}-color-picker`);
        const preview = picker.querySelector('.color-preview');
        const hexInput = picker.querySelector('.hex-input');
        const customButton = document.querySelector(`#${toolType}-color-popup .custom-color`);
        
        preview.style.backgroundColor = hex;
        hexInput.value = hex;
        customButton.style.backgroundColor = hex;
        
        // Always update the current color to the new custom color
        this.currentColors[toolType] = hex;
        
        // Update the tool button shadow
        const button = document.getElementById(TOOLS[toolType].id);
        button.style.textShadow = `0 0 10px ${hex}`;
        
        // Update active state in the color popup
        this.updateActiveColor(toolType, customButton);
    }
    
    // Create the custom color picker UI
    createColorPicker(toolType) {
        const colors = TOOLS[toolType].colors;
        const popup = document.createElement('div');
        popup.id = `${toolType}-color-popup`;
        popup.className = 'color-popup';
        
        // Add custom color button at the top
        const customButton = document.createElement('button');
        customButton.className = 'color-option custom-color';
        customButton.setAttribute('data-color', 'custom');
        customButton.title = "Custom color";
        
        // Set the button's background to the current custom color for this tool
        customButton.style.backgroundColor = this.customColors[toolType];
        
        // Create custom color picker
        const picker = document.createElement('div');
        picker.className = 'custom-color-picker';
        picker.id = `${toolType}-color-picker`;
        
        // Hue slider
        const hueSlider = document.createElement('div');
        hueSlider.className = 'hue-slider';
        const hueHandle = document.createElement('div');
        hueHandle.className = 'hue-slider-handle';
        hueSlider.appendChild(hueHandle);
        
        // Saturation/Value picker
        const svPicker = document.createElement('div');
        svPicker.className = 'saturation-value-picker';
        const whiteGradient = document.createElement('div');
        whiteGradient.className = 'white-gradient';
        const blackGradient = document.createElement('div');
        blackGradient.className = 'black-gradient';
        const svHandle = document.createElement('div');
        svHandle.className = 'picker-handle';
        svPicker.appendChild(whiteGradient);
        svPicker.appendChild(blackGradient);
        svPicker.appendChild(svHandle);
        
        // Color preview
        const preview = document.createElement('div');
        preview.className = 'color-preview';
        
        // Hex input
        const hexInput = document.createElement('input');
        hexInput.type = 'text';
        hexInput.className = 'hex-input';
        hexInput.maxLength = 7;
        hexInput.placeholder = '#RRGGBB';
        
        // Add all elements to the picker
        picker.appendChild(hueSlider);
        picker.appendChild(svPicker);
        picker.appendChild(preview);
        picker.appendChild(hexInput);
        
        // Initialize picker UI based on current color
        const hsv = this.hsvValues[toolType];
        const rgb = this.hsvToRgb(hsv.h, hsv.s, hsv.v);
        const hex = this.rgbToHex(rgb.r, rgb.g, rgb.b);
        
        // Set initial positions and colors
        const huePos = (hsv.h / 360) * 100;
        hueHandle.style.left = `${huePos}%`;
        
        svPicker.style.backgroundColor = this.rgbToHex(
            ...Object.values(this.hsvToRgb(hsv.h, 100, 100))
        );
        
        svHandle.style.left = `${hsv.s}%`;
        svHandle.style.top = `${100 - hsv.v}%`;
        
        preview.style.backgroundColor = hex;
        hexInput.value = hex;
        
        // Add event listeners for the picker
        hueSlider.addEventListener('mousedown', (e) => {
            this.isDraggingHue = true;
            this.activePickerTool = toolType;
            this.handleMouseMove(e);
        });
        
        svPicker.addEventListener('mousedown', (e) => {
            this.isDraggingSV = true;
            this.activePickerTool = toolType;
            this.handleMouseMove(e);
        });
        
        hexInput.addEventListener('input', (e) => {
            const newHex = e.target.value;
            if (/^#[0-9A-F]{6}$/i.test(newHex)) {
                const rgb = this.hexToRgb(newHex);
                if (rgb) {
                    const hsv = this.rgbToHsv(rgb.r, rgb.g, rgb.b);
                    this.hsvValues[toolType] = hsv;
                    
                    // Update UI positions
                    const huePos = (hsv.h / 360) * 100;
                    hueHandle.style.left = `${huePos}%`;
                    
                    svPicker.style.backgroundColor = this.rgbToHex(
                        ...Object.values(this.hsvToRgb(hsv.h, 100, 100))
                    );
                    
                    svHandle.style.left = `${hsv.s}%`;
                    svHandle.style.top = `${100 - hsv.v}%`;
                    
                    preview.style.backgroundColor = newHex;
                    
                    // Use updateColorFromHsv to update everything consistently
                    this.updateColorFromHsv(toolType);
                }
            }
        });
        
        // Add the picker to the custom button
        customButton.appendChild(picker);
        popup.appendChild(customButton);
        
        // Add the predefined colors
        colors.forEach(color => {
            const button = document.createElement('button');
            button.className = 'color-option';
            button.setAttribute('data-color', color);
            button.style.backgroundColor = color;
            if (color === this.currentColors[toolType]) {
                button.classList.add('active');
            }
            popup.appendChild(button);
        });

        return popup;
    }

    setupToolButton(toolType) {
        const container = document.createElement('div');
        container.className = 'tool-container';
        
        const button = document.getElementById(TOOLS[toolType].id);
        const popup = this.createColorPicker(toolType);
        
        // Move the button into the container and add the popup
        button.parentNode.insertBefore(container, button);
        container.appendChild(button);
        container.appendChild(popup);
        
        // Initialize the button shadow right after creating it
        button.style.textShadow = `0 0 10px ${this.currentColors[toolType]}`;

        let hideTimeout;

        container.addEventListener('mouseenter', () => {
            clearTimeout(hideTimeout);
            popup.style.display = 'block';
        });

        container.addEventListener('mouseleave', () => {
            hideTimeout = setTimeout(() => {
                popup.style.display = 'none';
                
                // Hide all color pickers
                document.querySelectorAll('.custom-color-picker').forEach(picker => {
                    picker.style.display = 'none';
                });
            }, 100);
        });
        
        // Setup hover behavior for custom color button
        const customButton = popup.querySelector('.custom-color');
        const picker = customButton.querySelector('.custom-color-picker');
        
        customButton.addEventListener('mouseenter', () => {
            // Hide any other open pickers first
            document.querySelectorAll('.custom-color-picker').forEach(p => {
                p.style.display = 'none';
            });
            picker.style.display = 'block';
        });
        
        // Make clicking on the custom color button activate the color
        customButton.addEventListener('click', (e) => {
            // Only process clicks on the button itself, not the picker
            if (e.target === customButton) {
                this.currentColors[toolType] = this.customColors[toolType];
                this.updateActiveColor(toolType, customButton);
            }
            
            // Prevent event from bubbling
            e.stopPropagation();
        });
        
        // Handle regular color option clicks
        popup.querySelectorAll('.color-option:not(.custom-color)').forEach(option => {
            option.addEventListener('click', (e) => {
                this.currentColors[toolType] = e.target.getAttribute('data-color');
                this.updateActiveColor(toolType, e.target);
            });
        });

        return container;
    }

    updateActiveColor(toolType, activeOption) {
        const popup = document.getElementById(`${toolType}-color-popup`);
        popup.querySelectorAll('.color-option').forEach(option => {
            option.classList.remove('active');
        });
        activeOption.classList.add('active');
        
        const button = document.getElementById(TOOLS[toolType].id);
        button.style.textShadow = `0 0 10px ${this.currentColors[toolType]}`;
        
        // Only try to activate implemented tools
        if (toolType === 'highlight') {
            // Deactivate all other tools first
            Object.keys(this.activeTools).forEach(key => {
                this.activeTools[key] = false;
            });
            
            // Activate this tool
            this.activeTools.isHighlighting = true;
            
            // Update all button states
            this.updateButtonStates();
            
            // Update cursor
            this.updateCursor({ target: document.elementFromPoint(mouseX, mouseY) });
        } else if (toolType === 'draw' || toolType === 'text') {
            // For unimplemented tools, show the alert but don't activate the tool
            alert('This feature is not implemented yet!');
        }
    }

    updateButtonStates() {
        Object.keys(TOOLS).forEach(tool => {
            const button = document.getElementById(TOOLS[tool].id);
            const isActive = this.activeTools[`is${tool.charAt(0).toUpperCase() + tool.slice(1)}ing`];
            button.classList.toggle('active', isActive);
        });
        
        const eraseBtn = document.getElementById('erase-btn');
        eraseBtn.classList.toggle('active', this.activeTools.isErasing);
    }

    updateCursor(event) {
        if (this.activeTools.isHighlighting) {
            document.body.style.cursor = 'crosshair';
        } else if (this.activeTools.isDrawing) {
            document.body.style.cursor = 'crosshair';
        } else if (this.activeTools.isTexting) {
            document.body.style.cursor = 'text';
        } else if (this.activeTools.isCommenting) {
            document.body.style.cursor = 'crosshair';
        } else if (this.activeTools.isErasing) {
            document.body.style.cursor = 'pointer';
        } else {
            const target = event.target;
            const isTextElement = target.nodeType === Node.TEXT_NODE ||
                (target.nodeType === Node.ELEMENT_NODE &&
                    ['P', 'SPAN', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'TD', 'TH', 'FIGCAPTION'].includes(target.tagName));
            document.body.style.cursor = isTextElement ? 'text' : 'default';
        }
    }
    
    // Set up keyboard shortcuts for tools and color cycling
    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Don't trigger shortcuts if user is typing in an input field or contenteditable element
            if (e.target.tagName === 'INPUT' || 
                e.target.tagName === 'TEXTAREA' || 
                e.target.isContentEditable) {
                return;
            }
            
            // Check for Ctrl/Cmd + Z (Undo) and Ctrl/Cmd + Y or Ctrl/Cmd + Shift + Z (Redo)
            if (e.ctrlKey || e.metaKey) {
                if (e.key.toLowerCase() === 'z') {
                    if (e.shiftKey) {
                        // Ctrl/Cmd + Shift + Z for Redo
                        e.preventDefault();
                        this.redo();
                        return;
                    } else {
                        // Ctrl/Cmd + Z for Undo
                        e.preventDefault();
                        this.undo();
                        return;
                    }
                } else if (e.key.toLowerCase() === 'y') {
                    // Ctrl/Cmd + Y for Redo
                    e.preventDefault();
                    this.redo();
                    return;
                }
            }
            
            // Handle different shortcuts
            switch(e.key.toLowerCase()) {
                case 'h':
                    // Activate/deactivate highlight tool
                    this.activateTool('highlight');
                    break;
                    
                case 'd':
                    // Activate/deactivate draw tool (not implemented)
                    this.activateTool('draw');
                    break;
                    
                case 't':
                    // Activate/deactivate text tool (not implemented)
                    this.activateTool('text');
                    break;
                    
                case 'e':
                    // Activate/deactivate erase tool
                    this.activateTool('erase');
                    break;
                    
                case 'n':
                    // Toggle comment mode
                    this.activateTool('comment');
                    break;
                
                case 'escape':
                    // Deactivate all tools
                    this.deactivateAllTools();
                    break;
                    
                // Color selection shortcuts (1-5)
                case '1':
                case '2':
                case '3':
                case '4':
                case '5':
                    // Get the color index (0-4) from the key (1-5)
                    const colorIndex = parseInt(e.key) - 1;
                    this.setColorByIndex(colorIndex);
                    break;
            }
        });
    }
    
    // Deactivate all tools (for Escape key)
    deactivateAllTools() {
        let wasAnyToolActive = false;
        
        // Check if any tool was active
        Object.keys(this.activeTools).forEach(key => {
            if (this.activeTools[key]) {
                wasAnyToolActive = true;
            }
            this.activeTools[key] = false;
        });
        
        // Only update UI if we actually deactivated something
        if (wasAnyToolActive) {
            this.updateButtonStates();
            this.updateCursor({ target: document.elementFromPoint(mouseX, mouseY) });
        }
    }
    
    // Activate a specific tool (now handles all tools including eraser and comments)
    activateTool(toolType) {
        // Determine the state key based on tool type
        let toolStateKey;
        if (toolType === 'erase') {
            toolStateKey = 'isErasing';
        } else if (toolType === 'comment') {
            toolStateKey = 'isCommenting';
        } else {
            toolStateKey = `is${toolType.charAt(0).toUpperCase() + toolType.slice(1)}ing`;
        }
        
        // Check if this tool is already active - if so, deactivate it (toggle behavior)
        if (this.activeTools[toolStateKey]) {
            this.activeTools[toolStateKey] = false;
            if (toolType === 'comment') {
                isCommenting = false;
                this.closeCommentPopup();
            }
            this.updateButtonStates();
            this.updateCursor({ target: document.elementFromPoint(mouseX, mouseY) });
            return;
        }
        
        // For unimplemented tools, show an alert
        if ((toolType === 'draw' || toolType === 'text')) {
            alert('This feature is not implemented yet!');
            return;
        }
        
        // Reset all tool states
        Object.keys(this.activeTools).forEach(key => {
            this.activeTools[key] = false;
        });
        
        // Reset global state variables
        isCommenting = false;
        
        // Activate the requested tool
        this.activeTools[toolStateKey] = true;
        
        // Set global state for comment tool
        if (toolType === 'comment') {
            isCommenting = true;
        }
        
        // Update UI
        this.updateButtonStates();
        this.updateCursor({ target: document.elementFromPoint(mouseX, mouseY) });
    }
    
    // Set color by index (for number key shortcuts 1-5)
    setColorByIndex(index) {
        // Determine which tool is active
        let activeTool = null;
        
        if (this.activeTools.isHighlighting) {
            activeTool = 'highlight';
        } else if (this.activeTools.isDrawing) {
            activeTool = 'draw';
        } else if (this.activeTools.isTexting) {
            activeTool = 'text';
        }
        
        // If no color tool is active, do nothing
        if (!activeTool) return;
        
        // Get colors for the active tool
        const colors = TOOLS[activeTool].colors;
        
        // Check if the index is valid
        if (index >= 0 && index < colors.length) {
            const newColor = colors[index];
            
            // Update current color
            this.currentColors[activeTool] = newColor;
            
            // Update UI
            const popup = document.getElementById(`${activeTool}-color-popup`);
            const colorOption = popup.querySelector(`.color-option[data-color="${newColor}"]`);
            
            // If we found the color option, update its active state
            if (colorOption) {
                this.updateActiveColor(activeTool, colorOption);
            }
        }
    }
    
    // Cycle to the next color for the active tool
    cycleToNextColor() {
        // Determine which tool is active
        let activeTool = null;
        
        if (this.activeTools.isHighlighting) {
            activeTool = 'highlight';
        } else if (this.activeTools.isDrawing) {
            activeTool = 'draw';
        } else if (this.activeTools.isTexting) {
            activeTool = 'text';
        }
        
        // If no color tool is active, do nothing
        if (!activeTool) return;
        
        const colors = TOOLS[activeTool].colors;
        
        // Find the current color's index
        let currentIndex = -1;
        const currentColor = this.currentColors[activeTool];
        
        // Check if current color is a predefined color
        for (let i = 0; i < colors.length; i++) {
            if (colors[i] === currentColor) {
                currentIndex = i;
                break;
            }
        }
        
        // If using a custom color or the last predefined color, cycle to the first color
        // Otherwise, move to the next color
        const nextIndex = (currentIndex === -1 || currentIndex === colors.length - 1) ? 0 : currentIndex + 1;
        const nextColor = colors[nextIndex];
        
        // Update the current color
        this.currentColors[activeTool] = nextColor;
        
        // Update the UI
        const popup = document.getElementById(`${activeTool}-color-popup`);
        const colorOption = popup.querySelector(`.color-option[data-color="${nextColor}"]`);
        
        // If we found the color option, update its active state
        if (colorOption) {
            this.updateActiveColor(activeTool, colorOption);
        }
    }
    
    // Add an action to the undo history
    addToHistory(action) {
        // Clear redo stack when a new action is performed
        this.redoStack = [];
        this.undoStack.push(action);
    }

    // Perform an undo operation
    undo() {
        if (this.undoStack.length === 0) return;
        
        const action = this.undoStack.pop();
        this.redoStack.push(action);
        
        console.log('Undoing action:', action);
        
        if (action.type === 'highlight') {
            // Undo a highlight action by removing the highlight
            this.removeHighlightById(action.groupId);
        } 
        else if (action.type === 'erase') {
            // Undo an erase action by restoring the highlights
            this.restoreHighlights(action.highlightGroups);
        }
        else if (action.type === 'eraseAll') {
            // Undo an eraseAll action by restoring all highlights
            this.restoreHighlights(action.highlightGroups);
        }
    }

    // Perform a redo operation
    redo() {
        if (this.redoStack.length === 0) return;
        
        const action = this.redoStack.pop();
        this.undoStack.push(action);
        
        console.log('Redoing action:', action);
        
        if (action.type === 'highlight') {
            // Redo a highlight action by recreating the highlight
            this.recreateHighlight(action);
        } 
        else if (action.type === 'erase') {
            // Redo an erase action by removing the highlights again
            this.removeHighlightById(action.groupId);
        }
        else if (action.type === 'eraseAll') {
            // Redo an eraseAll action by removing all highlights again
            action.highlightGroups.forEach(group => {
                this.removeHighlightById(group.id);
            });
        }
    }

    // Remove a highlight by its groupId
    removeHighlightById(groupId) {
        chrome.storage.local.get([pdfUrl], function (result) {
            if (chrome.runtime.lastError) {
                console.error('Error loading annotations:', chrome.runtime.lastError);
                return;
            }

            const savedAnnotations = result[pdfUrl] || [];
            const groupIndex = savedAnnotations.findIndex(group => group.id === groupId);
            
            if (groupIndex !== -1) {
                const group = savedAnnotations[groupIndex];
                
                // Remove highlight spans from DOM
                document.querySelectorAll(`[data-group-id="${groupId}"]`).forEach(span => {
                    const parent = span.parentNode;
                    const textContent = span.textContent;
                    const textNode = document.createTextNode(textContent);
                    parent.replaceChild(textNode, span);
                });
                
                // Remove from storage
                savedAnnotations.splice(groupIndex, 1);
                chrome.storage.local.set({ [pdfUrl]: savedAnnotations });
                
                // Normalize to combine adjacent text nodes
                document.body.normalize();
            }
        });
    }

    // Restore highlights that were previously erased
    restoreHighlights(highlightGroups) {
        chrome.storage.local.get([pdfUrl], function (result) {
            if (chrome.runtime.lastError) {
                console.error('Error loading annotations:', chrome.runtime.lastError);
                return;
            }

            const savedAnnotations = result[pdfUrl] || [];
            
            // Add all groups back to storage
            highlightGroups.forEach(group => {
                if (!savedAnnotations.some(existing => existing.id === group.id)) {
                    savedAnnotations.push(group);
                }
            });
            
            chrome.storage.local.set({ [pdfUrl]: savedAnnotations }, function() {
                // After saving, reapply the highlights to the page
                highlightGroups.forEach(group => {
                    const pageElements = document.querySelectorAll('.gsr-page');
                    pageElements.forEach(pageElement => {
                        const textContainer = pageElement.querySelector('.gsr-text-ctn');
                        if (textContainer) {
                            group.nodes.forEach(nodeInfo => {
                                const node = findNodeInPage(textContainer, nodeInfo.xpath, nodeInfo.text);
                                if (node) {
                                    highlightNode(node, nodeInfo.text, group.color || currentColor, group.id);
                                }
                            });
                        }
                    });
                });
            });
        });
    }

    // Recreate a highlight that was previously removed
    recreateHighlight(action) {
        chrome.storage.local.get([pdfUrl], function (result) {
            if (chrome.runtime.lastError) {
                console.error('Error loading annotations:', chrome.runtime.lastError);
                return;
            }

            const savedAnnotations = result[pdfUrl] || [];
            
            // Add the highlight group back to storage if it doesn't exist
            if (!savedAnnotations.some(group => group.id === action.groupId)) {
                savedAnnotations.push(action.highlightGroup);
                
                chrome.storage.local.set({ [pdfUrl]: savedAnnotations }, function() {
                    // After saving, reapply the highlight to the page
                    const group = action.highlightGroup;
                    const pageElements = document.querySelectorAll('.gsr-page');
                    
                    pageElements.forEach(pageElement => {
                        const textContainer = pageElement.querySelector('.gsr-text-ctn');
                        if (textContainer) {
                            group.nodes.forEach(nodeInfo => {
                                const node = findNodeInPage(textContainer, nodeInfo.xpath, nodeInfo.text);
                                if (node) {
                                    highlightNode(node, nodeInfo.text, group.color || currentColor, group.id);
                                }
                            });
                        }
                    });
                });
            }
        });
    }

    // Comment functionality methods
    showCommentModeMessage() {
        this.showMessage('Comment mode activated. Select text to add a comment.', 'info');
    }

    showMessage(message, type = 'info') {
        const messageEl = document.createElement('div');
        messageEl.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'error' ? '#ef4444' : type === 'warning' ? '#ffd700' : '#007bff'};
            color: white;
            padding: 12px 16px;
            border-radius: 6px;
            z-index: 10001;
            font-size: 14px;
        `;
        messageEl.textContent = message;
        document.body.appendChild(messageEl);
        
        setTimeout(() => messageEl.remove(), 3000);
    }

    closeCommentPopup() {
        if (activeCommentPopup) {
            activeCommentPopup.remove();
            activeCommentPopup = null;
        }
        
        // Clear any text selection
        window.getSelection().removeAllRanges();
    }

    handleCommentSelection(event) {
        if (!this.activeTools.isCommenting) return;

        const selection = window.getSelection();
        if (selection.rangeCount === 0 || selection.isCollapsed) return;

        const selectedText = selection.toString().trim();
        if (selectedText.length < 3) {
            this.showMessage('Please select at least 3 characters', 'warning');
            selection.removeAllRanges();
            return;
        }

        if (selectedText.length > 500) {
            this.showMessage('Selection too long (max 500 characters)', 'warning');
            selection.removeAllRanges();
            return;
        }

        // Create comment popup
        const range = selection.getRangeAt(0);
        this.showCommentPopup(range, selectedText);
    }

    showCommentPopup(range, selectedText) {
        // Remove any existing popup
        this.closeCommentPopup();

        // Create popup element
        const popup = document.createElement('div');
        popup.className = 'comment-popup';
        popup.innerHTML = this.getCommentPopupHTML(selectedText);

        // Position popup
        const rect = range.getBoundingClientRect();
        const popupWidth = 320;
        const popupHeight = 300;

        let left = rect.left + (rect.width / 2) - (popupWidth / 2);
        let top = rect.bottom + 10;

        // Adjust for viewport boundaries
        if (left < 10) left = 10;
        if (left + popupWidth > window.innerWidth - 10) {
            left = window.innerWidth - popupWidth - 10;
        }
        if (top + popupHeight > window.innerHeight - 10) {
            top = rect.top - popupHeight - 10;
        }

        popup.style.left = left + 'px';
        popup.style.top = top + 'px';

        // Add to document
        document.body.appendChild(popup);
        activeCommentPopup = popup;

        // Setup handlers
        this.setupCommentPopupHandlers(popup, range, selectedText);
    }

    getCommentPopupHTML(selectedText) {
        return `
            <div class="comment-popup-header">
                <h3 class="comment-popup-title">Add Comment</h3>
                <button class="comment-popup-close" type="button">×</button>
            </div>
            <div class="comment-input-container">
                <textarea class="comment-textarea" placeholder="Add your comment..." maxlength="1000"></textarea>
                <div class="comment-char-counter">0 / 1000 characters</div>
            </div>
            <div class="comment-actions">
                <button class="comment-btn comment-btn-secondary" type="button">Cancel</button>
                <button class="comment-btn comment-btn-primary" type="button">Save Comment</button>
            </div>
        `;
    }

    setupCommentPopupHandlers(popup, range, selectedText) {
        // Close button
        const closeBtn = popup.querySelector('.comment-popup-close');
        closeBtn.addEventListener('click', () => this.closeCommentPopup());

        // Cancel button
        const cancelBtn = popup.querySelector('.comment-btn-secondary');
        cancelBtn.addEventListener('click', () => this.closeCommentPopup());

        // Save button
        const saveBtn = popup.querySelector('.comment-btn-primary');
        saveBtn.addEventListener('click', () => this.saveComment(range, selectedText));

        // Textarea character counter
        const textarea = popup.querySelector('.comment-textarea');
        const counter = popup.querySelector('.comment-char-counter');
        textarea.addEventListener('input', () => {
            const length = textarea.value.length;
            counter.textContent = `${length} / 1000 characters`;
            
            if (length > 900) {
                counter.classList.add('warning');
            } else {
                counter.classList.remove('warning');
            }
            
            if (length >= 1000) {
                counter.classList.add('error');
            } else {
                counter.classList.remove('error');
            }

            // Enable/disable save button
            saveBtn.disabled = length === 0;
        });

        // Keyboard shortcuts
        textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                this.saveComment(range, selectedText);
            } else if (e.key === 'Escape') {
                this.closeCommentPopup();
            }
        });

        // Auto-focus the textarea for immediate typing
        textarea.focus();

        // Setup handlers
        // popup.querySelector('.comment-popup-close').addEventListener('click', () => this.closeCommentPopup());
        
        // const editBtn = popup.querySelector('[data-action="edit"]');
        // editBtn.addEventListener('click', () => this.editComment(comment));
        
        // const deleteBtn = popup.querySelector('[data-action="delete"]');
        // deleteBtn.addEventListener('click', () => this.deleteComment(comment));
    }

    saveComment(range, selectedText) {
        const popup = activeCommentPopup;
        if (!popup) return;

        const textarea = popup.querySelector('.comment-textarea');
        const commentText = textarea.value.trim();

        if (!commentText) {
            this.showMessage('Please enter a comment', 'warning');
            return;
        }

        // Create comment data
        const commentId = 'comment-' + Date.now();
        const comment = {
            id: commentId,
            type: 'comment',
            text: commentText,
            selection: {
                startXPath: this.getCommentXPath(range.startContainer),
                endXPath: this.getCommentXPath(range.endContainer),
                startOffset: range.startOffset,
                endOffset: range.endOffset,
                selectedText: selectedText
            },
            timestamp: new Date().toISOString()
        };

        // Apply visual indicator to selected text
        this.applyCommentIndicator(range, commentId);

        // Save comment to storage
        this.saveCommentToStorage(comment);

        // Close popup
        this.closeCommentPopup();

        // Add to history for undo/redo
        const historyAction = {
            type: 'comment_create',
            commentId: commentId,
            comment: comment
        };
        this.addToHistory(historyAction);

        // Clear selection
        window.getSelection().removeAllRanges();
    }

    applyCommentIndicator(range, commentId) {
        try {
            const span = document.createElement('span');
            span.className = 'pdf-comment';
            span.dataset.commentId = commentId;
            span.addEventListener('click', () => this.showCommentDisplay(commentId));
            span.addEventListener('mouseenter', () => this.showCommentPreview(commentId, span));
            span.addEventListener('mouseleave', () => this.hideCommentPreview());

            range.surroundContents(span);
        } catch (error) {
            console.warn('Could not apply comment indicator:', error);
        }
    }

    saveCommentToStorage(comment) {
        if (!pdfUrl) return;

        chrome.storage.local.get([pdfUrl], (result) => {
            if (chrome.runtime.lastError) {
                console.error('Error loading annotations:', chrome.runtime.lastError);
                return;
            }

            const annotations = result[pdfUrl] || [];
            annotations.push(comment);

            chrome.storage.local.set({ [pdfUrl]: annotations }, () => {
                if (chrome.runtime.lastError) {
                    console.error('Error saving comment:', chrome.runtime.lastError);
                } else {
                    console.log('Comment saved:', comment);
                }
            });
        });
    }

    showCommentDisplay(commentId) {
        chrome.storage.local.get([pdfUrl], (result) => {
            const annotations = result[pdfUrl] || [];
            const comment = annotations.find(ann => ann.id === commentId);
            
            if (comment) {
                this.showCommentDisplayPopup(comment);
            }
        });
    }

    showCommentDisplayPopup(comment) {
        this.closeCommentPopup();

        const popup = document.createElement('div');
        popup.className = 'comment-popup';
        popup.innerHTML = `
            <div class="comment-popup-header">
                <h3 class="comment-popup-title">Comment</h3>
                <button class="comment-popup-close" type="button">×</button>
            </div>
            <div class="comment-display">
                <div class="comment-meta">
                    <span class="comment-timestamp">${this.formatTimestamp(comment.timestamp)}</span>
                </div>
                <div class="comment-content">${comment.text}</div>
                <div class="comment-display-actions">
                    <button class="comment-action-btn" data-action="edit" type="button">Edit</button>
                    <button class="comment-action-btn" data-action="delete" type="button">Delete</button>
                </div>
            </div>
        `;

        // Position popup near the comment
        const commentElement = document.querySelector(`[data-comment-id="${comment.id}"]`);
        if (commentElement) {
            const rect = commentElement.getBoundingClientRect();
            popup.style.left = (rect.left + rect.width / 2 - 160) + 'px';
            popup.style.top = (rect.bottom + 10) + 'px';
        } else {
            popup.style.left = '50%';
            popup.style.top = '50%';
            popup.style.transform = 'translate(-50%, -50%)';
        }

        document.body.appendChild(popup);
        activeCommentPopup = popup;

        // Setup handlers
        popup.querySelector('.comment-popup-close').addEventListener('click', () => this.closeCommentPopup());
        
        const editBtn = popup.querySelector('[data-action="edit"]');
        editBtn.addEventListener('click', () => this.editComment(comment));
        
        const deleteBtn = popup.querySelector('[data-action="delete"]');
        deleteBtn.addEventListener('click', () => this.deleteComment(comment));
    }

    showCommentPreview(commentId, element) {
        this.hideCommentPreview();

        commentPreviewTimeout = setTimeout(() => {
            chrome.storage.local.get([pdfUrl], (result) => {
                const annotations = result[pdfUrl] || [];
                const comment = annotations.find(ann => ann.id === commentId);
                
                if (comment) {
                    const preview = document.createElement('div');
                    preview.className = 'comment-preview-tooltip show';
                    preview.textContent = comment.text.substring(0, 100) + (comment.text.length > 100 ? '...' : '');
                    
                    const rect = element.getBoundingClientRect();
                    preview.style.left = (rect.left + rect.width / 2 - 100) + 'px';
                    preview.style.top = (rect.top - 40) + 'px';
                    
                    document.body.appendChild(preview);
                    preview.dataset.commentPreview = 'true';
                }
            });
        }, 500);
    }

    hideCommentPreview() {
        if (commentPreviewTimeout) {
            clearTimeout(commentPreviewTimeout);
            commentPreviewTimeout = null;
        }

        const preview = document.querySelector('[data-comment-preview="true"]');
        if (preview) {
            preview.remove();
        }
    }

    deleteComment(comment) {
        chrome.storage.local.get([pdfUrl], (result) => {
            const annotations = result[pdfUrl] || [];
            const filteredAnnotations = annotations.filter(ann => ann.id !== comment.id);
            
            chrome.storage.local.set({ [pdfUrl]: filteredAnnotations }, () => {
                // Remove visual indicator
                const element = document.querySelector(`[data-comment-id="${comment.id}"]`);
                if (element) {
                    const parent = element.parentNode;
                    const textNode = document.createTextNode(element.textContent);
                    parent.replaceChild(textNode, element);
                    parent.normalize();
                }
                
                this.closeCommentPopup();
            });
        });
    }

    editComment(comment) {
        this.closeCommentPopup();

        const popup = document.createElement('div');
        popup.className = 'comment-popup';
        popup.innerHTML = `
            <div class="comment-popup-header">
                <h3 class="comment-popup-title">Edit Comment</h3>
                <button class="comment-popup-close" type="button">×</button>
            </div>
            <div class="comment-input-container">
                <textarea class="comment-textarea" placeholder="Edit your comment..." maxlength="1000">${comment.text}</textarea>
                <div class="comment-char-counter">${comment.text.length} / 1000 characters</div>
            </div>
            <div class="comment-actions">
                <button class="comment-btn comment-btn-secondary" type="button">Cancel</button>
                <button class="comment-btn comment-btn-primary" type="button">Save Changes</button>
            </div>
        `;

        // Position popup near the comment
        const commentElement = document.querySelector(`[data-comment-id="${comment.id}"]`);
        if (commentElement) {
            const rect = commentElement.getBoundingClientRect();
            popup.style.left = (rect.left + rect.width / 2 - 160) + 'px';
            popup.style.top = (rect.bottom + 10) + 'px';
        } else {
            popup.style.left = '50%';
            popup.style.top = '50%';
            popup.style.transform = 'translate(-50%, -50%)';
        }

        document.body.appendChild(popup);
        activeCommentPopup = popup;

        // Setup handlers
        popup.querySelector('.comment-popup-close').addEventListener('click', () => this.closeCommentPopup());
        
        const cancelBtn = popup.querySelector('.comment-btn-secondary');
        cancelBtn.addEventListener('click', () => this.closeCommentPopup());
        
        const saveBtn = popup.querySelector('.comment-btn-primary');
        saveBtn.addEventListener('click', () => this.saveEditedComment(comment));

        // Textarea character counter
        const textarea = popup.querySelector('.comment-textarea');
        const counter = popup.querySelector('.comment-char-counter');
        textarea.addEventListener('input', () => {
            const length = textarea.value.length;
            counter.textContent = `${length} / 1000 characters`;
            
            if (length > 900) {
                counter.classList.add('warning');
            } else {
                counter.classList.remove('warning');
            }
            
            if (length >= 1000) {
                counter.classList.add('error');
            } else {
                counter.classList.remove('error');
            }

            // Enable/disable save button
            saveBtn.disabled = length === 0;
        });

        // Keyboard shortcuts
        textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                this.saveEditedComment(comment);
            } else if (e.key === 'Escape') {
                this.closeCommentPopup();
            }
        });

        // Focus textarea and select all text for easy editing
        textarea.focus();
        textarea.select();
    }

    saveEditedComment(originalComment) {
        const popup = activeCommentPopup;
        if (!popup) return;

        const textarea = popup.querySelector('.comment-textarea');
        const newCommentText = textarea.value.trim();

        if (!newCommentText) {
            this.showMessage('Please enter a comment', 'warning');
            return;
        }

        if (newCommentText === originalComment.text) {
            // No changes made, just close the popup
            this.closeCommentPopup();
            return;
        }

        // Update comment in storage
        chrome.storage.local.get([pdfUrl], (result) => {
            const annotations = result[pdfUrl] || [];
            const commentIndex = annotations.findIndex(ann => ann.id === originalComment.id);
            
            if (commentIndex !== -1) {
                // Update the comment text and timestamp
                annotations[commentIndex].text = newCommentText;
                annotations[commentIndex].lastModified = new Date().toISOString();
                
                chrome.storage.local.set({ [pdfUrl]: annotations }, () => {
                    if (chrome.runtime.lastError) {
                        console.error('Error saving edited comment:', chrome.runtime.lastError);
                        this.showMessage('Error saving comment', 'error');
                    } else {
                        console.log('Comment edited successfully:', annotations[commentIndex]);
                        this.showMessage('Comment updated successfully', 'info');
                        
                        // Add to history for undo/redo
                        const historyAction = {
                            type: 'comment_edit',
                            commentId: originalComment.id,
                            oldText: originalComment.text,
                            newText: newCommentText
                        };
                        this.addToHistory(historyAction);
                    }
                    
                    this.closeCommentPopup();
                });
            } else {
                console.error('Comment not found for editing:', originalComment.id);
                this.showMessage('Comment not found', 'error');
                this.closeCommentPopup();
            }
        });
    }

    getCommentXPath(node) {
        if (node.nodeType === Node.TEXT_NODE) {
            const parent = node.parentNode;
            const textNodes = Array.from(parent.childNodes).filter(n => n.nodeType === Node.TEXT_NODE);
            const textIndex = textNodes.indexOf(node);
            
            const parentXPath = this.getElementXPath(parent);
            return `${parentXPath}/text()[${textIndex + 1}]`;
        } else {
            return this.getElementXPath(node);
        }
    }

    getElementXPath(element) {
        const parts = [];
        let current = element;
        
        while (current && current.nodeType === Node.ELEMENT_NODE && current !== document.body) {
            let index = 0;
            let sibling = current.previousSibling;
            
            while (sibling) {
                if (sibling.nodeType === Node.ELEMENT_NODE && sibling.nodeName === current.nodeName) {
                    index++;
                }
                sibling = sibling.previousSibling;
            }
            
            const tagName = current.nodeName.toLowerCase();
            const pathIndex = index > 0 ? `[${index + 1}]` : '';
            parts.unshift(tagName + pathIndex);
            current = current.parentNode;
        }
        
        return parts.length ? '/' + parts.join('/') : '';
    }

    formatTimestamp(timestamp) {
        const date = new Date(timestamp);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
        if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
        if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
        
        return date.toLocaleDateString();
    }

    loadAndApplyComments() {
        if (!pdfUrl) {
            console.log('No PDF URL available for loading comments');
            return;
        }
        
        chrome.storage.local.get([pdfUrl], (result) => {
            if (chrome.runtime.lastError) {
                console.error('Error loading comments:', chrome.runtime.lastError);
                return;
            }
            
            const annotations = result[pdfUrl] || [];
            const comments = annotations.filter(ann => ann.type === 'comment');
            
            console.log(`Found ${comments.length} comments for PDF:`, pdfUrl);
            
            if (comments.length > 0) {
                console.log('Loading existing comments:', comments);
                
                // Wait for page content to be loaded before applying comments
                this.waitForPageContentAndApplyComments(comments);
            } else {
                console.log('No comments found to restore');
            }
        });
    }

    waitForPageContentAndApplyComments(comments, retryCount = 0) {
        const maxRetries = 10;
        const retryDelay = 1000; // 1 second
        
        // Check if we have meaningful page content
        const pageElements = document.querySelectorAll('.gsr-page');
        const textContainers = document.querySelectorAll('.gsr-text-ctn');
        
        console.log(`Attempt ${retryCount + 1}: Found ${pageElements.length} page elements, ${textContainers.length} text containers`);
        
        // Check if any text container has meaningful content
        let hasContent = false;
        textContainers.forEach(container => {
            if (container.textContent.trim().length > 100) {
                hasContent = true;
            }
        });
        
        if (hasContent || retryCount >= maxRetries) {
            if (hasContent) {
                console.log('Page content detected, applying comments');
            } else {
                console.log('Max retries reached, attempting to apply comments anyway');
            }
            
            // Apply comments to all existing pages
            pageElements.forEach((pageElement, index) => {
                console.log(`Applying comments to page ${index + 1}`);
                this.applyCommentsToPage(pageElement, comments);
            });
            
            // Also apply comments to any text containers that might exist without page wrapper
            textContainers.forEach((textContainer, index) => {
                const pageElement = textContainer.closest('.gsr-page') || textContainer;
                console.log(`Applying comments to text container ${index + 1}`);
                this.applyCommentsToPage(pageElement, comments);
            });
        } else {
            console.log(`Page content not ready, retrying in ${retryDelay}ms...`);
            setTimeout(() => {
                this.waitForPageContentAndApplyComments(comments, retryCount + 1);
            }, retryDelay);
        }
    }

    applyCommentsToPage(pageElement, comments) {
        const textContainer = pageElement.querySelector('.gsr-text-ctn');
        if (!textContainer) {
            console.log('No text container found in page element');
            return;
        }

        // Check if the text container has meaningful content
        const textContent = textContainer.textContent.trim();
        if (textContent.length < 50) {
            console.log('Text container appears to be empty or loading, skipping comment application');
            return;
        }

        console.log(`Applying ${comments.length} comments to page with ${textContent.length} characters`);

        // First, remove any existing comment indicators to prevent duplicates
        const existingCommentSpans = textContainer.querySelectorAll('.pdf-comment');
        console.log(`Found ${existingCommentSpans.length} existing comment indicators, removing them`);
        existingCommentSpans.forEach(span => {
            const parent = span.parentNode;
            const textNode = document.createTextNode(span.textContent);
            parent.replaceChild(textNode, span);
        });
        // Normalize to combine adjacent text nodes
        textContainer.normalize();

        comments.forEach(comment => {
            try {
                const range = this.recreateRangeFromComment(textContainer, comment);
                if (range) {
                    this.applyCommentIndicator(range, comment.id);
                    console.log('Successfully applied comment:', comment.id);
                } else {
                    console.log('Failed to recreate range for comment:', comment.id);
                }
            } catch (error) {
                console.warn('Could not restore comment:', comment.id, error);
            }
        });
    }

    recreateRangeFromComment(textContainer, comment) {
        try {
            const selection = comment.selection;
            
            // First try XPath-based approach
            let startNode = this.findNodeByCommentXPath(textContainer, selection.startXPath);
            let endNode = this.findNodeByCommentXPath(textContainer, selection.endXPath);
            
            // If XPath fails, try text-based fallback
            if (!startNode || !endNode) {
                console.log('XPath failed for comment:', comment.id, 'trying text-based approach');
                console.log('Looking for text:', JSON.stringify(selection.selectedText));
                console.log('In container:', textContainer);
                const result = this.findNodesByText(textContainer, selection.selectedText);
                if (result) {
                    console.log('Text-based approach succeeded for comment:', comment.id);
                    startNode = result.startNode;
                    endNode = result.endNode;
                    selection.startOffset = result.startOffset;
                    selection.endOffset = result.endOffset;
                } else {
                    console.log('Text-based approach also failed for comment:', comment.id);
                    console.log('Available text in container:', textContainer.textContent.substring(0, 200) + '...');
                }
            }
            
            if (!startNode || !endNode) {
                console.warn('Could not find nodes for comment:', comment.id);
                return null;
            }

            const range = document.createRange();
            range.setStart(startNode, selection.startOffset);
            range.setEnd(endNode, selection.endOffset);
            
            const rangeText = range.toString().trim();
            if (rangeText === selection.selectedText || rangeText.includes(selection.selectedText)) {
                return range;
            } else {
                console.warn('Text mismatch for comment:', comment.id, 'expected:', selection.selectedText, 'got:', rangeText);
                return null;
            }
        } catch (error) {
            console.error('Error recreating range for comment:', comment.id, error);
            return null;
        }
    }

    findNodeByCommentXPath(container, xpath) {
        try {
            if (xpath.includes('/text()[')) {
                const textMatch = xpath.match(/(.+)\/text\(\[(\d+)\]\)$/);
                if (textMatch) {
                    const elementXPath = textMatch[1];
                    const textIndex = parseInt(textMatch[2]) - 1;
                    
                    const elementResult = document.evaluate(elementXPath, container, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
                    const element = elementResult.singleNodeValue;
                    
                    if (element) {
                        const textNodes = Array.from(element.childNodes).filter(n => n.nodeType === Node.TEXT_NODE);
                        return textNodes[textIndex] || null;
                    }
                }
            }
            
            const result = document.evaluate(xpath, container, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
            return result.singleNodeValue;
        } catch (error) {
            console.error('Error finding node by XPath:', xpath, error);
            return null;
        }
    }

    findNodesByText(container, targetText) {
        try {
            console.log('Searching for text in container:', targetText);
            
            // Get all text nodes in the container
            const walker = document.createTreeWalker(
                container,
                NodeFilter.SHOW_TEXT,
                null,
                false
            );
            
            const textNodes = [];
            let node;
            while (node = walker.nextNode()) {
                if (node.textContent.trim()) {
                    textNodes.push(node);
                }
            }
            
            console.log(`Found ${textNodes.length} text nodes in container`);
            
            // Get the full text content of the container
            const fullText = container.textContent;
            console.log('Full container text length:', fullText.length);
            
            // Try exact match first
            if (fullText.includes(targetText)) {
                console.log('Target text found in container');
                
                // Try to find the target text across text nodes
                for (let i = 0; i < textNodes.length; i++) {
                    const startNode = textNodes[i];
                    const startText = startNode.textContent;
                    
                    // Check if the target text is entirely within this node
                    const startIndex = startText.indexOf(targetText);
                    if (startIndex !== -1) {
                        console.log('Found target text in single node');
                        return {
                            startNode: startNode,
                            endNode: startNode,
                            startOffset: startIndex,
                            endOffset: startIndex + targetText.length
                        };
                    }
                    
                    // Check if the target text spans multiple nodes
                    let combinedText = startText;
                    let endNodeIndex = i;
                    
                    while (endNodeIndex < textNodes.length - 1 && !combinedText.includes(targetText)) {
                        endNodeIndex++;
                        combinedText += textNodes[endNodeIndex].textContent;
                    }
                    
                    const combinedStartIndex = combinedText.indexOf(targetText);
                    if (combinedStartIndex !== -1) {
                        console.log('Found target text spanning multiple nodes');
                        // Calculate offsets
                        let currentLength = 0;
                        let startOffset = 0;
                        let endOffset = 0;
                        let actualStartNode = startNode;
                        let actualEndNode = startNode;
                        
                        // Find start position
                        for (let j = i; j <= endNodeIndex; j++) {
                            const nodeText = textNodes[j].textContent;
                            if (currentLength + nodeText.length > combinedStartIndex) {
                                actualStartNode = textNodes[j];
                                startOffset = combinedStartIndex - currentLength;
                                break;
                            }
                            currentLength += nodeText.length;
                        }
                        
                        // Find end position
                        currentLength = 0;
                        const targetEndIndex = combinedStartIndex + targetText.length;
                        for (let j = i; j <= endNodeIndex; j++) {
                            const nodeText = textNodes[j].textContent;
                            if (currentLength + nodeText.length >= targetEndIndex) {
                                actualEndNode = textNodes[j];
                                endOffset = targetEndIndex - currentLength;
                                break;
                            }
                            currentLength += nodeText.length;
                        }
                        
                        return {
                            startNode: actualStartNode,
                            endNode: actualEndNode,
                            startOffset: startOffset,
                            endOffset: endOffset
                        };
                    }
                }
            } else {
                console.log('Target text not found in container');
                // Try fuzzy matching - look for partial matches
                const words = targetText.split(/\s+/);
                if (words.length > 1) {
                    console.log('Trying fuzzy matching with words:', words);
                    for (const word of words) {
                        if (word.length > 3 && fullText.includes(word)) {
                            console.log('Found partial match for word:', word);
                            // Try to find this word and use it as a fallback
                            for (let i = 0; i < textNodes.length; i++) {
                                const node = textNodes[i];
                                const wordIndex = node.textContent.indexOf(word);
                                if (wordIndex !== -1) {
                                    return {
                                        startNode: node,
                                        endNode: node,
                                        startOffset: wordIndex,
                                        endOffset: wordIndex + word.length
                                    };
                                }
                            }
                        }
                    }
                }
            }
            
            console.log('No match found for target text');
            return null;
        } catch (error) {
            console.error('Error finding nodes by text:', error);
            return null;
        }
    }
}

function initializeAnnotation() {
    console.log('Initializing annotation...');
    const colorPickerManager = new ColorPickerManager();
    
    // Store the instance globally for access from other functions
    window.colorPickerManagerInstance = colorPickerManager;

    // Set up message listener for PDF URL
    window.addEventListener("message", (event) => {
        if (event.data.type === "FROM_CONTENT_SCRIPT") {
            const receivedPdfUrl = event.data.pdfUrl;
            if (receivedPdfUrl === '__proto__' || receivedPdfUrl === 'constructor' || receivedPdfUrl === 'prototype') {
                console.error('Invalid PDF URL received:', receivedPdfUrl);
                return;
            }
            pdfUrl = receivedPdfUrl;
            console.log('PDF URL received:', pdfUrl);
            
            // Load existing comments when PDF URL is received
            // Add multiple attempts with increasing delays to ensure page content is loaded
            setTimeout(() => {
                colorPickerManager.loadAndApplyComments();
            }, 500);
            
            setTimeout(() => {
                colorPickerManager.loadAndApplyComments();
            }, 1500);
            
            setTimeout(() => {
                colorPickerManager.loadAndApplyComments();
            }, 3000);
            
            // Also set up a periodic check for the first 10 seconds
            let retryCount = 0;
            const maxRetries = 5;
            const retryInterval = setInterval(() => {
                retryCount++;
                colorPickerManager.loadAndApplyComments();
                
                if (retryCount >= maxRetries) {
                    clearInterval(retryInterval);
                }
            }, 2000);
        }
    }, false);

    // Initialize color pickers for each tool
    Object.keys(TOOLS).forEach(tool => {
        colorPickerManager.setupToolButton(tool);
    });

    // Set up button click handlers
    setupButtonHandlers(colorPickerManager);

    // Set up document event listeners with the manager instance
    document.addEventListener('mouseup', () => handleSelection(colorPickerManager));
    document.addEventListener('click', (e) => handleErase(e, colorPickerManager));

    observePageChanges();
}

function setupButtonHandlers(colorPickerManager) {
    const alertNotImplemented = () => alert('This feature is not implemented yet!');
    
    // Tool buttons
    document.getElementById(TOOLS.highlight.id).addEventListener('click', () => {
        colorPickerManager.activateTool('highlight');
    });
    
    document.getElementById(TOOLS.draw.id).addEventListener('click', alertNotImplemented);
    document.getElementById(TOOLS.text.id).addEventListener('click', alertNotImplemented);
    
    // Comment button
    document.getElementById(TOOLS.comment.id).addEventListener('click', () => {
        colorPickerManager.activateTool('comment');
    });
    
    // Other buttons
    document.getElementById('erase-btn').addEventListener('click', () => {
        colorPickerManager.activateTool('erase');
    });
    
    document.getElementById('erase-all-btn').addEventListener('click', eraseAllAnnotations);
    
    document.getElementById('settings-btn').addEventListener('click', () => {
        chrome.runtime.openOptionsPage();
    });
    
    // Star button - only add event listener if the button exists
    const starBtn = document.getElementById('star-btn');
    if (starBtn) {
        starBtn.addEventListener('click', () => {
            chrome.tabs.create({ url: 'https://github.com/salcc/Scholar-PDF-Reader-with-Annotations' });
        });
    }
}

function observePageChanges() {
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === 'childList') {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE && node.classList.contains('gsr-text-ctn')) {
                        console.log('New page content loaded, applying annotations and comments');
                        chrome.storage.local.get([pdfUrl], function (result) {
                            if (chrome.runtime.lastError) {
                                console.error('Error loading annotations:', chrome.runtime.lastError);
                                return;
                            }
                            const savedAnnotations = result[pdfUrl] || [];
                            console.log('Loaded annotations:', savedAnnotations);
                            
                            // Apply highlights
                            const highlights = savedAnnotations.filter(ann => ann.type !== 'comment');
                            applyAnnotationsToPage(node.closest('.gsr-page'), highlights);
                            
                            // Apply comments
                            const comments = savedAnnotations.filter(ann => ann.type === 'comment');
                            if (comments.length > 0 && window.colorPickerManagerInstance) {
                                window.colorPickerManagerInstance.applyCommentsToPage(node.closest('.gsr-page'), comments);
                            }
                        });
                    }
                });
            }
        });
    });

    const config = { childList: true, subtree: true };
    observer.observe(document.body, config);
}

function handleSelection(colorPickerManager) {
    if (colorPickerManager.activeTools.isHighlighting && !colorPickerManager.activeTools.isErasing) {
        const selection = window.getSelection();
        if (selection.isCollapsed) return;

        const range = selection.getRangeAt(0);
        const groupId = 'group-' + Date.now();
        // Pass the current color from the manager
        highlightRange(range, groupId, colorPickerManager.currentColors.highlight);
        selection.removeAllRanges();
    } else if (colorPickerManager.activeTools.isCommenting) {
        colorPickerManager.handleCommentSelection(event);
    }
}

function handleErase(event, colorPickerManager) {
    if (!colorPickerManager.activeTools.isErasing) return;

    const highlightSpan = findHighlightSpanAtPoint(event.clientX, event.clientY);
    if (highlightSpan) {
        const groupId = highlightSpan.dataset.groupId;
        eraseAnnotation(groupId);
    }
}

function findHighlightSpanAtPoint(x, y) {
    const elements = document.elementsFromPoint(x, y);
    for (let element of elements) {
        if (element.classList.contains('pdf-highlight')) {
            return element;
        }

        const nestedHighlight = element.querySelector('.pdf-highlight');
        if (nestedHighlight) {
            const rect = nestedHighlight.getBoundingClientRect();
            if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
                return nestedHighlight;
            }
        }
    }
    return null;
}

function highlightRange(range, groupId, color) {
    const startNode = range.startContainer;
    const endNode = range.endContainer;
    const commonAncestor = range.commonAncestorContainer;

    const highlightedNodes = [];
    const nodesToProcess = getNodesBetween(startNode, endNode, commonAncestor);

    nodesToProcess.forEach((node) => {
        if (node.nodeType === Node.TEXT_NODE) {
            const startOffset = (node === startNode) ? range.startOffset : 0;
            const endOffset = (node === endNode) ? range.endOffset : node.length;

            // Check if the node is already partially highlighted
            const existingHighlights = getExistingHighlights(node);
            if (existingHighlights.length > 0) {
                highlightedNodes.push(...handleOverlappingHighlights(node, startOffset, endOffset, groupId, existingHighlights, color));
            } else {
                highlightedNodes.push(highlightTextNode(node, startOffset, endOffset, groupId, color));
            }
        }
    });

    // Save annotation and record in history
    saveAnnotation(groupId, highlightedNodes, color);
}

function saveAnnotation(groupId, nodes, color) {
    const annotation = {
        id: groupId,
        color: color,
        nodes: nodes.map(node => ({
            text: node.textContent,
            xpath: getXPath(node),
            offset: getTextOffset(node)
        }))
    };

    chrome.storage.local.get([pdfUrl], function (result) {
        if (chrome.runtime.lastError) {
            console.error('Error loading annotations:', chrome.runtime.lastError);
            return;
        }

        const savedAnnotations = result[pdfUrl] || [];
        const existingIndex = savedAnnotations.findIndex(group => group.id === groupId);
        if (existingIndex !== -1) {
            savedAnnotations[existingIndex] = annotation;
        } else {
            savedAnnotations.push(annotation);
        }

        chrome.storage.local.set({ [pdfUrl]: savedAnnotations }, function () {
            if (chrome.runtime.lastError) {
                console.error('Error saving annotations:', chrome.runtime.lastError);
            } else {
                console.log('Annotation saved for %s:', pdfUrl, annotation);
                
                // Add to history for undo/redo
                const historyAction = {
                    type: 'highlight',
                    groupId: groupId,
                    highlightGroup: annotation
                };
                
                // Access the colorPickerManager instance
                if (window.colorPickerManagerInstance) {
                    window.colorPickerManagerInstance.addToHistory(historyAction);
                }
            }
        });
    });
}

function getExistingHighlights(node) {
    const highlights = [];
    while (node && node !== document.body) {
        if (node.classList && node.classList.contains('pdf-highlight')) {
            highlights.push(node);
        }
        node = node.parentNode;
    }
    return highlights;
}

function handleOverlappingHighlights(node, startOffset, endOffset, groupId, existingHighlights, color) {
    const highlightedNodes = [];
    let currentOffset = 0;

    existingHighlights.sort((a, b) => {
        return a.textContent.indexOf(node.textContent) - b.textContent.indexOf(node.textContent);
    });

    existingHighlights.forEach((highlight) => {
        const highlightStart = highlight.textContent.indexOf(node.textContent);
        const highlightEnd = highlightStart + node.textContent.length;

        if (startOffset < highlightStart && currentOffset < highlightStart) {
            highlightedNodes.push(highlightTextNode(node, currentOffset, highlightStart, groupId, color));
        }

        if (startOffset <= highlightEnd && endOffset >= highlightStart) {
            highlight.style.backgroundColor = color;
            highlight.dataset.groupId = groupId;
            highlightedNodes.push(highlight);
        }

        currentOffset = highlightEnd;
    });

    if (endOffset > currentOffset) {
        highlightedNodes.push(highlightTextNode(node, currentOffset, endOffset, groupId, color));
    }

    return highlightedNodes;
}

function highlightTextNode(node, startOffset, endOffset, groupId, color) {
    const range = document.createRange();
    range.setStart(node, startOffset);
    range.setEnd(node, endOffset);

    const highlightSpan = document.createElement('span');
    highlightSpan.className = 'pdf-highlight';
    highlightSpan.style.backgroundColor = color;
    highlightSpan.dataset.groupId = groupId;

    range.surroundContents(highlightSpan);
    return highlightSpan;
}

function getNodesBetween(startNode, endNode, commonAncestor) {
    const nodes = [];
    let currentNode = startNode;

    while (currentNode) {
        nodes.push(currentNode);
        if (currentNode === endNode) break;
        currentNode = getNextNode(currentNode, commonAncestor);
    }

    return nodes;
}

function getNextNode(node, stopNode) {
    if (node.firstChild) return node.firstChild;
    while (node) {
        if (node === stopNode) return null;
        if (node.nextSibling) return node.nextSibling;
        node = node.parentNode;
    }
    return null;
}

function removeHighlightGroup(group) {
    group.nodes.forEach(nodeInfo => {
        const node = findNodeByXPath(nodeInfo.xpath);
        if (node) {
            const highlightSpan = node.parentNode.querySelector(`[data-group-id="${group.id}"]`);
            if (highlightSpan) {
                const parent = highlightSpan.parentNode;
                const textContent = highlightSpan.textContent;
                const textNode = document.createTextNode(textContent);
                parent.replaceChild(textNode, highlightSpan);
            } else {
                console.warn('Highlight span not found for node:', node);
            }
        } else {
            // console.warn('Node not found for XPath:', nodeInfo.xpath);
        }
    });

    document.body.normalize();
}

function eraseAnnotation(groupId) {
    chrome.storage.local.get([pdfUrl], function (result) {
        if (chrome.runtime.lastError) {
            console.error('Error loading annotations:', chrome.runtime.lastError);
            return;
        }

        const savedAnnotations = result[pdfUrl] || [];
        const groupIndex = savedAnnotations.findIndex(group => group.id === groupId);
        if (groupIndex !== -1) {
            const group = savedAnnotations[groupIndex];
            
            // Save to history before removing
            if (window.colorPickerManagerInstance) {
                const historyAction = {
                    type: 'erase',
                    groupId: groupId,
                    highlightGroups: [group]
                };
                window.colorPickerManagerInstance.addToHistory(historyAction);
            }
            
            removeHighlightGroup(group);

            savedAnnotations.splice(groupIndex, 1);

            chrome.storage.local.set({ [pdfUrl]: savedAnnotations }, function () {
                if (chrome.runtime.lastError) {
                    console.error('Error saving annotations:', chrome.runtime.lastError);
                } else {
                    console.log('Annotation removed for groupId:', groupId);
                }
            });
        }
    });
}

function eraseAllAnnotations() {
    if (confirm('Are you sure you want to erase all annotations from this PDF?')) {
        chrome.storage.local.get([pdfUrl], function (result) {
            if (chrome.runtime.lastError) {
                console.error('Error loading annotations:', chrome.runtime.lastError);
                return;
            }

            const savedAnnotations = result[pdfUrl] || [];
            
            // Save to history before removing all
            if (savedAnnotations.length > 0 && window.colorPickerManagerInstance) {
                const historyAction = {
                    type: 'eraseAll',
                    highlightGroups: [...savedAnnotations]  // Clone the array
                };
                window.colorPickerManagerInstance.addToHistory(historyAction);
            }
            
            savedAnnotations.forEach(group => {
                removeHighlightGroup(group);
            });

            chrome.storage.local.remove([pdfUrl], function () {
                if (chrome.runtime.lastError) {
                    console.error('Error removing annotations:', chrome.runtime.lastError);
                } else {
                    console.log('All annotations removed for ' + pdfUrl);
                }
            });
        });
    } else {
        console.log('Erase all annotations cancelled');
    }
}

function findNodeByXPath(xpath) {
    try {
        const nodes = document.evaluate(xpath, document, null, XPathResult.ANY_TYPE, null);
        return nodes.iterateNext();
    } catch (e) {
        console.error('Error finding node by XPath:', xpath, e);
        return null;
    }
}

function applyAnnotationsToPage(pageElement, highlightGroups) {
    const textContainer = pageElement.querySelector('.gsr-text-ctn');
    if (!textContainer) return;

    highlightGroups.forEach(group => {
        group.nodes.forEach(nodeInfo => {
            const node = findNodeInPage(textContainer, nodeInfo.xpath, nodeInfo.text);
            if (node) {
                highlightNode(node, nodeInfo.text, group.color || currentColor, group.id);
            } else {
                //console.warn('Node not found for annotation:', nodeInfo);
            }
        });
    });
}

function findNodeInPage(textContainer, xpath, text) {
    try {
        // console.log("textContainer", textContainer);
        // console.log("xpath", xpath);
        // console.log("text", text);
        const xpathResult = document.evaluate(xpath, textContainer, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
        const node = xpathResult.singleNodeValue;
        if (node && node.textContent.includes(text)) {
            return node;
        }
    } catch (e) {
        console.error('XPath evaluation failed:', e);
    }
    return null;
}

function getXPath(node) {
    const parts = [];
    while (node && node.nodeType === Node.ELEMENT_NODE) {
        let sibling = node;
        let siblingCount = 1;
        while ((sibling = sibling.previousSibling) !== null) {
            if (sibling.nodeType === Node.ELEMENT_NODE && sibling.nodeName === node.nodeName) {
                siblingCount++;
            }
        }
        parts.unshift(node.nodeName.toLowerCase() + '[' + siblingCount + ']');
        node = node.parentNode;
    }
    
    // Remove the last element (innermost span)
    parts.pop();
    
    return '/' + parts.join('/');
}

function getTextOffset(node) {
    let offset = 0;
    let currentNode = node;
    while (currentNode.previousSibling) {
        currentNode = currentNode.previousSibling;
        if (currentNode.nodeType === Node.TEXT_NODE) {
            offset += currentNode.textContent.length;
        }
    }
    return offset;
}

// function highlightNode(node, text, color, groupId) {
//     const range = document.createRange();
//     //const textNode = node.firstChild; 
//     const textNode = getFirstTextNode(node);
//     console.log("node text", node.textContent);
//     if (!textNode) {
//         console.warn('No text node found in:', node);
//         return null;
//     }
//     const startOffset = textNode.textContent.indexOf(text);
//     if (startOffset !== -1 && (startOffset + text.length) <= textNode.length) {
//         range.setStart(textNode, startOffset);
//         range.setEnd(textNode, startOffset + text.length);
//         const highlightSpan = document.createElement('span');
//         highlightSpan.className = 'pdf-highlight';
//         highlightSpan.style.backgroundColor = color;
//         highlightSpan.dataset.groupId = groupId;
//         try {
//             range.surroundContents(highlightSpan);
//             return highlightSpan;
//         } catch (e) {
//             console.error('Error highlighting node:', e);
//             return null;
//         }
//     } else {
//         console.warn('Text not found or offset out of bounds in node:', {text, node, startOffset, textNodeLength: textNode.length});
//         console.log(textNode.textContent);
//         return null;
//     }
// }

function getFirstTextNode(node) {
    if (!node) return null;
    if (node.nodeType === Node.TEXT_NODE) return node;
    for (let child of node.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) return child;
    }
    return null;
}

function getAllTextNodes(container) {
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null, false);
    const nodes = [];
    let node;
    while (node = walker.nextNode()) {
        nodes.push(node);
    }
    return nodes;
}

function highlightNode(node, text, color, groupId) {
    const textNodes = getAllTextNodes(node);
    const fullText = textNodes.map(n => n.textContent).join('');
    const startIndex = fullText.indexOf(text);
    if (startIndex === -1) {
        console.warn('Highlight text not found in container');
        return;
    }
    const endIndex = startIndex + text.length;

    // Find start and end nodes/offsets
    let currentLength = 0, startNode, startOffset, endNode, endOffset;
    for (let node of textNodes) {
        let nextLength = currentLength + node.textContent.length;
        if (!startNode && startIndex < nextLength) {
            startNode = node;
            startOffset = startIndex - currentLength;
        }
        if (!endNode && endIndex <= nextLength) {
            endNode = node;
            endOffset = endIndex - currentLength;
            break;
        }
        currentLength = nextLength;
    }

    if (startNode && endNode) {
        const range = document.createRange();
        range.setStart(startNode, startOffset);
        range.setEnd(endNode, endOffset);
        const highlightSpan = document.createElement('span');
        highlightSpan.className = 'pdf-highlight';
        highlightSpan.style.backgroundColor = color;
        highlightSpan.dataset.groupId = groupId;
        try {
            range.surroundContents(highlightSpan);
            return highlightSpan;
        } catch (e) {
            console.error('Error highlighting across nodes:', e);
        }
    } else {
        console.warn('Could not determine start/end nodes for highlight');
    }
}

// Initialize when the DOM is ready
document.addEventListener('DOMContentLoaded', initializeAnnotation);