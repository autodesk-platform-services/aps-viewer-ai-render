import { initViewer, loadModel } from './viewer.js';
import { initTree } from './sidebar.js';

const login = document.getElementById('login');

// const thumbnailscontainer = document.getElementById('itens-container');
// thumbnailscontainer.toggleAttribute('mouse-dragging', true);

const viewerContainer = document.getElementById('preview');
const imagesContainer  = document.getElementById('image-comparer');
try {
    const resp = await fetch('/api/auth/profile');
    if (resp.ok) {
        // thumbnailsContainer.style.visibility = 'hidden';
        const user = await resp.json();
        // Ensure the name is trimmed to first word and max 8 chars, with ellipsis if needed
        let displayName = user.name || '';
        if (displayName.includes(' ')) {
            displayName = displayName.split(' ')[0];
        }
        if (displayName.length > 5) {
            displayName = displayName.slice(0, 5) + '...';
        }
        login.innerText = `Logout (${displayName})`;
        login.onclick = () => window.location.replace('/api/auth/logout');
        login.style.visibility = 'visible';
        GLOBAL_VIEWER = await initViewer(viewerContainer);
        initTree('#tree', (id) => loadModel(GLOBAL_VIEWER, window.btoa(id).replace(/=/g, '')));
        CURRENT_MODEL = "racadvancedsampleproject.rvt" 
        const res = loadModel(GLOBAL_VIEWER, "dXJuOmFkc2sub2JqZWN0czpvcy5vYmplY3Q6anBvbS1yYWNhZHZhbmNlZHNhbXBsZXByb2plY3QtcnZ0L3JhY2FkdmFuY2Vkc2FtcGxlcHJvamVjdC5ydnQ");      
    } else {
        window.location.replace('/api/auth/login');
    }
} catch (err) {
    alert('Could not initialize the application. See console for more details.');
    console.error(err);
}