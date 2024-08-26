// Wait for the DOM to be fully loaded
document.addEventListener('DOMContentLoaded', function() {
    // Create a simple React component
    function App() {
        const [theme, setTheme] = React.useState('light');
        
        function toggleTheme() {
            setTheme(prevTheme => prevTheme === 'light' ? 'dark' : 'light');
        }
        
        return React.createElement('div', { className: `App ${theme}` },
            React.createElement('h1', null, 'NexID - Base Identity Report'),
            React.createElement('button', { onClick: toggleTheme }, 'Toggle Theme'),
            React.createElement('p', null, `Current theme: ${theme}`)
        );
    }

    // Render the React app
    ReactDOM.render(
        React.createElement(App),
        document.getElementById('root')
    );
});