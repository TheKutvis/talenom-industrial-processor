// Talenom Toolbox Version Configuration
// Single source of truth for version number across all pages

const TOOLBOX_VERSION = "2.0";
const TOOLBOX_VERSION_LABEL = "Toolbox";

// Update version badge on page load
document.addEventListener('DOMContentLoaded', function() {
    const versionBadge = document.querySelector('.version-badge');
    if (versionBadge) {
        // Preserve any data-i18n attribute if it exists
        const versionText = `v${TOOLBOX_VERSION} ${TOOLBOX_VERSION_LABEL}`;
        
        // Check if element has data-i18n attribute (for compatibility)
        if (versionBadge.hasAttribute('data-i18n')) {
            versionBadge.setAttribute('data-i18n', 'app.version');
        }
        
        versionBadge.textContent = versionText;
    }
});
