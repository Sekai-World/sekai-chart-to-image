#!/usr/bin/env python
# coding: utf-8

# In[1]:


import glob
import json
import os
import requests

from util_object import Score


# In[2]:


folders = r'Scores'
filenames = glob.glob(os.path.join(folders, '*', '*'))


# In[3]:


music_difficulties_metadatas = requests.get('https://raw.githubusercontent.com/Sekai-World/sekai-master-db-diff/master/musicDifficulties.json')
music_difficulties_metadatas = json.loads(music_difficulties_metadatas.text)

musics_metadatas = requests.get('https://raw.githubusercontent.com/Sekai-World/sekai-master-db-diff/master/musics.json')
musics_metadatas = json.loads(musics_metadatas.text)

musicid_to_title = {musics_metadata['id']: musics_metadata['title'] for musics_metadata in musics_metadatas}


# In[4]:


scores = {}
score_jsons = []
for music_difficulties_metadata in music_difficulties_metadatas:
    
    music_id = music_difficulties_metadata['musicId']
    music_difficulty = music_difficulties_metadata['musicDifficulty']
    play_level = music_difficulties_metadata['playLevel']
    note_count = music_difficulties_metadata['noteCount']
    
    filename = os.path.join(folders, f'{music_id:04d}', f'{music_difficulty}.sus')

    score = Score(filename=filename, music_id=music_id, music_difficulty=music_difficulty, play_level=play_level, note_count=note_count)
    if note_count != len(score.playable_notes):
        print(f'Warning: Note Count of Score ({music_id, music_difficulty}) Is Inconsistent!')
        print(f'Counted: {len(score.playable_notes)}, Should Be: {note_count}')
        
    if len(score.skill_notes) != 6:
        print(f'Warning: SKill Note Count of Score ({music_id, music_difficulty}) Is Not 6!')
        print(f'Counted: {len(score.skill_notes)}')
    
    if len(score.prepare_notes) != 2:
        print(f'Warning: SKill Note Count of Score ({music_id, music_difficulty}) Is Not 2!')
        print(f'Counted: {len(score.prepare_notes)}')
        
    scores[(music_id, music_difficulty)] = score
    score_jsons.append(score.to_json())


# In[8]:


with open('scores.json', 'w+') as f:
    json.dump(score_jsons, f, indent=4)


# In[ ]:




