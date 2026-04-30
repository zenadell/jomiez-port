import os
import re

directory = '/Users/mac/Desktop/port-3-export'

pattern = re.compile(r'(<a[^>]*?)href="#"([^>]*class="secondary-button[^>]*>\s*<div[^>]*>\s*Contact Us\s*</div>)')

for root, dirs, files in os.walk(directory):
    if 'node_modules' in root or '.git' in root or 'admin' in root:
        continue
    for file in files:
        if file.endswith('.html'):
            filepath = os.path.join(root, file)
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()
            
            new_content, count = pattern.subn(r'\1href="/contact-us"\2', content)
            
            if count > 0:
                with open(filepath, 'w', encoding='utf-8') as f:
                    f.write(new_content)
                print(f"Fixed {count} instances in {filepath}")

