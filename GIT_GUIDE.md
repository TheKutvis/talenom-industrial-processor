# Git Quick Reference for Talenom Industrial Processor

## Essential Git Commands

### Daily Workflow
```bash
# Check status
git status

# Add specific files
git add filename.js
git add public/

# Add all changes
git add .

# Commit with message
git commit -m "feat: add new processor functionality"

# View commit history
git log --oneline
git log --oneline --graph

# View changes
git diff                    # Unstaged changes
git diff --staged          # Staged changes
```

### Branch Management
```bash
# Create and switch to new branch
git checkout -b feature/new-processor

# Switch branches
git checkout main
git checkout feature/new-processor

# List branches
git branch

# Merge branch
git checkout main
git merge feature/new-processor

# Delete branch
git branch -d feature/new-processor
```

### Remote Repository (when ready to push to GitHub/GitLab)
```bash
# Add remote origin
git remote add origin https://github.com/yourusername/talenom-industrial-processor.git

# Push to remote
git push -u origin main

# Pull latest changes
git pull origin main

# Clone repository
git clone https://github.com/yourusername/talenom-industrial-processor.git
```

### Useful Git Aliases (optional)
```bash
git config --global alias.st status
git config --global alias.co checkout
git config --global alias.br branch
git config --global alias.ci commit
git config --global alias.lg "log --oneline --graph --all"
```

## Conventional Commit Messages

Use these prefixes for clear commit history:

- `feat:` New features
- `fix:` Bug fixes
- `docs:` Documentation changes
- `style:` Code style changes (formatting, etc.)
- `refactor:` Code refactoring
- `perf:` Performance improvements
- `test:` Adding or updating tests
- `chore:` Maintenance tasks

### Examples
```bash
git commit -m "feat: add Jatko-PASI sound effects"
git commit -m "fix: resolve account mapping service parameter issue"
git commit -m "docs: update README with installation instructions"
git commit -m "style: improve industrial theme consistency"
git commit -m "refactor: optimize Excel processing performance"
```

## Project-Specific Workflow

### Adding New Processors
1. Create feature branch: `git checkout -b feature/new-processor`
2. Add service: `services/newProcessor.js`
3. Add interface: `public/new-processor.html`
4. Update server: Add routes in `server.js`
5. Test functionality
6. Commit: `git commit -m "feat: add new processor for X format"`
7. Merge to main: `git checkout main && git merge feature/new-processor`

### Updating Configurations
1. Modify configuration files
2. Test changes
3. Commit: `git commit -m "config: update account mappings for new format"`

### Bug Fixes
1. Create hotfix branch: `git checkout -b hotfix/fix-description`
2. Fix the issue
3. Test thoroughly
4. Commit: `git commit -m "fix: resolve sound playback issue in Chrome"`
5. Merge back: `git checkout main && git merge hotfix/fix-description`

## Files to Generally Avoid Committing

Already configured in .gitignore:
- `*.csv` - Test data files
- `*.xlsx` - Excel test files
- `temp/` - Temporary processing files
- `uploads/` - File upload staging
- `.env` - Environment secrets
- `logs/` - Application logs
- `node_modules/` - Dependencies

## Recovery Commands

### Undo Changes
```bash
# Discard unstaged changes
git checkout -- filename.js

# Unstage files
git reset HEAD filename.js

# Undo last commit (keep changes)
git reset --soft HEAD~1

# Undo last commit (discard changes) - CAREFUL!
git reset --hard HEAD~1
```

### View History
```bash
# Show what changed in each commit
git log --stat

# Show detailed changes
git log -p

# Show commits by author
git log --author="Your Name"

# Show commits in date range
git log --since="2025-11-01" --until="2025-11-06"
```