import glob
import json
import math
import os
import re
import requests

from collections import OrderedDict, defaultdict, Counter
from fractions import Fraction

class RawNote:
    
    def __init__(self, measure, note_class, start_pos, note_property, width, scaling, note_order, long_note_id):
        
        self.measure = measure
        self.note_class = note_class
        self.start_pos = start_pos
        self.note_property = note_property
        self.width = width
        self.scaling = scaling
        self.note_order = note_order
        self.long_note_id = long_note_id
        self.offset = measure + Fraction(note_order, scaling)
        
        # Handle Different Note Classes
        if note_class == 1:
            if start_pos == 15 and note_property == 1:
                self.note_description = 'Prepare Start'
            elif start_pos == 15 and note_property == 2:
                self.note_description = 'Prepare End'
            elif start_pos == 0 and note_property == 4:
                self.note_description = 'Skill'
            elif note_property == 1:
                self.note_description = 'Normal'
            elif note_property == 2:
                self.note_description = 'Critical'
            elif note_property == 3:
                self.note_description = 'Flick Dummy'
            else:
                self.note_description = None
                assert False
        elif note_class == 3:
            if note_property == 1:
                self.note_description = 'Long Start'
            elif note_property == 2:
                self.note_description = 'Long End'
            elif note_property == 3:
                self.note_description = 'Long Mid'
            elif note_property == 5:
                self.note_description = 'Long Dummy'
            else:
                self.note_description = None
                assert False
        elif note_class == 5:
            if note_property == 1:
                self.note_description = 'Up Flick'
            elif note_property == 3:
                self.note_description = 'Left Flick'
            elif note_property == 4:
                self.note_description = 'Right Flick'
            elif note_property == 2:
                self.note_description = 'Down Curve'
            elif note_property == 5:
                self.note_description = 'Left Curve'
            elif note_property == 6:
                self.note_description = 'Right Curve'
            else:
                self.note_description = None
                assert False
        elif note_class == 4:
            self.note_description = 'Skill'
        else:
            self.note_description = None
            assert False
    
    def __repr__(self):

        return f"RawNote(measure={self.measure:>3d}, " + \
               f"note_range={self.start_pos:02d}-{self.start_pos+self.width-1:02d}, " + \
               f"offset={float(self.offset):>7.3f}, " + \
               f"note_class={self.note_description})"

class BaseNote:
    
    def __init__(self, start_pos, width, offset):
        
        self.start_pos = start_pos
        self.width = width
        self.offset = offset
        
    def __repr__(self):
        
        return f"BaseNote(note_range={self.start_pos:02d}-{self.start_pos+self.width-1:02d}, " + \
               f"offset={float(self.offset):>7.3f})"
    
    def set_time_offset(self, bpm_events):

        time_offset = 0
        for bpm_event, next_bpm_event in zip(bpm_events[:-1], bpm_events[1:]):
            if self.offset < next_bpm_event.offset:
                time_offset += (self.offset - bpm_event.offset) * Fraction(60, bpm_event.bpm) * 4
                break
            else:
                time_offset += (next_bpm_event.offset - bpm_event.offset) * Fraction(60, bpm_event.bpm) * 4
        else:
            time_offset += (self.offset - bpm_events[-1].offset) * Fraction(60, bpm_events[-1].bpm) * 4
        self.time_offset = time_offset
            
        
class SkillNote(BaseNote):
    
    def __repr__(self):
        
        return f"SkillNote(offset={float(self.offset):>7.3f})"
    
    def to_json(self):
        
        return {
            'type': 'skill_note',
            'measure_offset': float(self.offset),
            'time_offset': float(self.time_offset)
        }

class PrepareNote(BaseNote):
    
    def __init__(self, start_pos, width, offset, is_start):
        
        super().__init__(start_pos, width, offset)
        self.is_start = is_start
    
    def __repr__(self):
        
        return f"PrepareNote(offset={float(self.offset):>7.3f}, " + \
               f"is_start={self.is_start})"
    
    def to_json(self):
        
        return {
            'type': 'prepare_note',
            'measure_offset': float(self.offset),
            'time_offset': float(self.time_offset),
            'is_start': self.is_start
        }

class PlayableNote(BaseNote):
    
    def __init__(self, start_pos, width, offset, is_critical=False, is_flick=False, is_long_start=False, is_long_end=False, is_long_auto=False, is_long_mid=False):
        
        self.start_pos = start_pos
        self.width = width
        self.offset = offset
        
        self.is_critical = is_critical
        self.is_flick = is_flick
        self.is_long_start = is_long_start
        self.is_long_end = is_long_end
        self.is_long_auto = is_long_auto
        self.is_long_mid = is_long_mid
        
        self.set_note_property()
        
    def set_note_property(self):
        
        note_property = [self.is_critical, self.is_flick, self.is_long_start, self.is_long_end, self.is_long_auto, self.is_long_mid]
        note_property_string = ''.join([str(int(p)) for p in note_property])
        
        note_property_lookup = {
            "000000": ("Normal", 10),
            "100000": ("Normal Critical", 20),
            "010000": ("Flick", 10),
            "110000": ("Flick Critical", 30),
            "001000": ("Long Start", 10),
            "101000": ("Long Start Critical", 20),
            "000100": ("Long End", 10),
            "100100": ("Long End Critical", 20),
            "010100": ("Long End Flick", 10),
            "110100": ("Long End Flick Critical", 30),
            "000010": ("Long Auto", 1),
            "100010": ("Long Auto Critical", 1),
            "000001": ("Long Mid", 1),
            "100001": ("Long Mid Critical", 2)
        }
        
        self.note_description, self.weight = note_property_lookup[note_property_string]
    
    def set_combo_number(self, combo_number):
        
        self.combo_number = combo_number
    
    def __repr__(self):
        
        return f"PlayableNote(note_range={self.start_pos:02d}-{self.start_pos+self.width-1:02d}, " + \
               f"offset={float(self.offset):>7.3f}, " + \
               f"time_offset={float(self.time_offset):>7.3f}, " + \
               (f"combo_num={self.combo_number:>4d}, " if self.combo_number is not None else "") + \
               f"note_class={self.note_description})"
    
    def to_json(self):
     
        return {
            'type': 'playable_note',
            'note_class': self.note_description,
            'note_range': [self.start_pos, self.start_pos+self.width-1],
            'measure_offset': float(self.offset),
            'time_offset': float(self.time_offset),
            'combo_num': self.combo_number
        }

class BPMChangeEvent:
    
    def __init__(self, measure, scaling, event_order, bpm_key):
        
        self.measure = measure
        self.scaling = scaling
        self.event_order = event_order
        self.offset = measure + Fraction(event_order, scaling)
        self.bpm_key = bpm_key
        self.bpm = None
    
    def __repr__(self):
        
        if self.bpm is None:
            bpm_description = f"bpm_key={self.bpm_key}, "
        else:
            bpm_description = f"bpm={self.bpm}, "
        
        return f"BpmEvent(measure={self.measure:>3d}, " + \
               bpm_description + \
               f"offset={float(self.offset):>7.3f})" 
    
    def update_bpm_value(self, bpm_lookup_table):
        
        self.bpm = bpm_lookup_table[self.bpm_key]
        
    def to_json(self):
        
        return {
            'type': 'bpm_change_event',
            'measure_offset': float(self.offset),
            'bpm': self.bpm
        }

class Score(object):
    
    def __init__(self, filename, music_id, music_difficulty, play_level, note_count):
        
        self.filename = filename
        self.music_id = music_id
        self.music_difficulty = music_difficulty
        self.play_level = play_level
        self.note_count = note_count
        
        self.bpm_lookup_table = {}
        self.bpm_events = []
        
        self.raw_notes = []
        self.raw_notes_pool = set()
        
        self.playable_notes = []
        self.skill_notes = []
        self.prepare_notes = []
        
        self.parse_lines()
        self.convert_bpm_events()
        self.convert_raw_notes()
        
        self.assign_combo_numbers()
        self.assign_time_offsets()
        
        # assert len(self.playable_notes) == note_count
    
    def parse_objects(self, line):
        result = re.match('#([0-9a-f]{5,6}):\ *([0-9a-f]*)$', line)
        return result

    def parse_bpm(self, line):
        result = re.match('#BPM([0-9a-f]*):\ ([0-9]*)$', line)
        return result
    
    def parse_lines(self):
        
        with open(self.filename, 'r', encoding='utf-8') as f:
            for line in f:
                if result := self.parse_objects(line):
                    self.add_parsed_objects(result.group(1), result.group(2))
                elif result := self.parse_bpm(line):
                    self.add_parsed_bpms(result.group(1), result.group(2))
        
    
    def add_parsed_objects(self, group_1, group_2):
        
        # Maybe Notes or BPM Change Events
        #
        # (Notes)
        # e.g. line = #00016:0000120000120000
        #      group_1 = 00016
        #      group_2 = 0000120000120000
        #
        # (Long Notes)
        # e.g. line = #020350:00000000000000530000000000000000
        #      group_1 = 020350
        #      group_2 = 00000000000000530000000000000000
        #
        # (#xxx08: BPM Change Events)
        # e.g. line = #00008: 01
        #      group_1 = 00008
        #      group_2 = 01
        
        measure = int(group_1[:3])
        note_class = int(group_1[3])
        start_pos = int(group_1[4], 16)
        if len(group_1) == 6:
            long_note_id = int(group_1[5])
        else:
            long_note_id = None
        
        note_scaling = len(group_2) // 2
        for i in range(note_scaling):
            
            if note_class == 0 and start_pos == 2:
                # shorten measures
                continue
            
            elif note_class == 0 and start_pos == 8:
                # bpm change events
                if group_2[i*2:i*2+2] != '00':
                    self.bpm_events.append(BPMChangeEvent(**{
                        'measure': measure,
                        'scaling': note_scaling,
                        'event_order': i,
                        'bpm_key': group_2[i*2:i*2+2]
                    }))
                    continue
            
            else:
                note_property, note_width = int(group_2[i*2]), int(group_2[i*2+1], 16)
                if note_property == note_width == 0:
                    # blank notes
                    continue
                
                note_pool_key = (measure, note_class, start_pos, note_property, note_width, note_scaling, i, long_note_id)
                if note_pool_key in self.raw_notes_pool:
                    continue
                else:
                    self.raw_notes_pool.add(note_pool_key)
                
                self.raw_notes.append(RawNote(**{
                    'measure': measure,
                    'note_class': note_class,
                    'start_pos': start_pos,
                    'note_property': note_property,
                    'width': note_width,
                    'scaling': note_scaling,
                    'note_order': i,
                    'long_note_id': long_note_id
                }))
        
        
    def add_parsed_bpms(self, group_1, group_2):
        
        self.bpm_lookup_table[group_1] = int(group_2)
        
    def convert_bpm_events(self):
        
        # Use BPM lookup table to convert BPM change events
        self.bpm_events.sort(key=lambda x: x.offset)
        for event in self.bpm_events:
            event.update_bpm_value(self.bpm_lookup_table)
    
    def convert_raw_notes(self):
        
        # Sort by offset and position
        self.raw_notes.sort(key=lambda x: (x.offset, x.start_pos))
        
        # Collect notes with same position and offset together
        # Additionally, merge notes like (start=2, end=3) and (start=1, end=4) together
        # (i.e. one note is covered by another note fully)

        # Merge all the position pairs
        time_to_known_positions = defaultdict(set)
        for raw_note in self.raw_notes:
            time_to_known_positions[raw_note.offset].add((raw_note.start_pos, raw_note.width))
        
        covered_by = dict()
        for time_offset, positions in time_to_known_positions.items():
            # sort with start pos and then end pos (left start first, right end first)
            positions = sorted(positions, key=lambda x: (x[0], -(x[0]+x[1])))
            valid_positions = []
            for start_pos, width in positions:
                # if new range is covered by existed notes, ignore
                for valid_start_pos, valid_width in valid_positions:
                    if start_pos >= valid_start_pos and \
                       start_pos + width <= valid_start_pos + valid_width:
                        # record the note is covered by what note
                        covered_by[(time_offset, start_pos, width)] = (time_offset, valid_start_pos, valid_width)
                        break
                else: # append if not covered
                    valid_positions.append((start_pos, width))
                    # record the note is covered by itself
                    covered_by[(time_offset, start_pos, width)] = (time_offset, start_pos, width)

        time_position_to_notes = OrderedDict()
        for raw_note in self.raw_notes:
            time_position = (raw_note.offset, raw_note.start_pos, raw_note.width)
            time_position = covered_by[time_position]
            if time_position not in time_position_to_notes:
                time_position_to_notes[time_position] = [raw_note]
            else:
                time_position_to_notes[time_position].append(raw_note)
                
        # Debugging
#         self.time_position_to_notes = time_position_to_notes

        # Aggregate Several Notes with Same Position and Offset
        holding_period_status = {}
        for (offset, start_pos, width), notes in time_position_to_notes.items():
            has_normal, is_critical, is_flick, is_long_start, is_long_end, is_long_auto, is_long_mid = [False] * 7
            long_note_id = None
            for note in notes:
                if note.note_description == 'Skill':
                    self.skill_notes.append(SkillNote(start_pos=start_pos, width=width, offset=offset))
                    assert len(notes) == 1
                    break
                elif note.note_description == 'Prepare Start':
                    self.prepare_notes.append(PrepareNote(start_pos=start_pos, width=width, offset=offset, is_start=True))
                    assert len(notes) == 1
                    break
                elif note.note_description == 'Prepare End':
                    self.prepare_notes.append(PrepareNote(start_pos=start_pos, width=width, offset=offset, is_start=False))
                    assert len(notes) == 1
                    break
                elif note.note_description == 'Long Start':
                    is_long_start = True
                    long_note_id = note.long_note_id
                elif note.note_description == 'Long End':
                    is_long_end = True
                    long_note_id = note.long_note_id
                elif note.note_description == 'Critical':
                    is_critical = True
                elif note.note_description == 'Long Mid':
                    is_long_mid = True
                    long_note_id = note.long_note_id
                elif note.note_description in ['Left Flick', 'Right Flick', 'Up Flick']:
                    is_flick = True
                elif note.note_description in ['Long Dummy']:
                    # Long Dummy : Note to fix the shape of long note
                    # It needs a fake normal note.
                    break
                elif note.note_description in ['Flick Dummy', 'Left Curve', 'Down Curve', 'Right Curve']:
                    # Flick Dummy : Base note to put flicks on it. (Air note in Chunithm cannot be put alone)
                    # Curves : Note to make the shape of long note like arc
                    pass
                elif note.note_description == 'Normal':
                    has_normal = True
                else:
                    assert False
            else:
                # it will go there if didn't find skill notes or prepare notes (be careful about for-else in python)
                    
                # If a long start is critical, it will make the notes during the holding period all critical
                if is_long_start:
                    # Save offset and is_critical of long_start
                    assert long_note_id is not None
                    holding_period_status[long_note_id] = (offset, is_critical)

                elif is_long_end:
                    # Use is_critical of corresponding long_start
                    assert long_note_id is not None
                    start_offset, start_is_critical = holding_period_status[long_note_id]
                    is_critical = is_critical or start_is_critical
                    end_offset = offset
                    
                    # Add long_auto eighth note
                    # First long_auto offset
                    long_auto_offset = Fraction(math.floor(start_offset * 8) + 1, 8)
                    while long_auto_offset < end_offset:
                        self.playable_notes.append(
                            PlayableNote(
                                start_pos=0, 
                                width=1, 
                                offset=long_auto_offset, 
                                is_critical=is_critical, 
                                is_flick=False, 
                                is_long_start=False,
                                is_long_end=False,
                                is_long_auto=True,
                                is_long_mid=False
                            )
                        )
                        # Next long_auto offset
                        long_auto_offset += Fraction(1, 8)
                    del holding_period_status[long_note_id]

                elif is_long_mid:
                    # Use is_critical of corresponding long_start
                    assert long_note_id is not None
                    _, is_critical = holding_period_status[long_note_id]

                self.playable_notes.append(
                    PlayableNote(
                        start_pos=start_pos, 
                        width=width, 
                        offset=offset, 
                        is_critical=is_critical, 
                        is_flick=is_flick, 
                        is_long_start=is_long_start, 
                        is_long_end=is_long_end, 
                        is_long_auto=is_long_auto, 
                        is_long_mid=is_long_mid
                    )
                )
        
    def assign_combo_numbers(self):
        
        self.playable_notes.sort(key=lambda x: (x.offset, x.weight, x.start_pos))
        for combo_num, playable_note in enumerate(self.playable_notes, 1):
            playable_note.set_combo_number(combo_num)
            
    def assign_time_offsets(self):
        
        self.bpm_events.sort(key=lambda x: x.offset)
        for note in self.playable_notes + self.skill_notes + self.prepare_notes:
            note.set_time_offset(self.bpm_events)
            
    def get_solo_base_scores(self):
        
        weight_sum = sum(note.weight for note in self.playable_notes)
        play_level_multiplier = Fraction(max(0, self.play_level - 5) + 200, 200)
        
        weight_sum_with_combo = 0
        for note in self.playable_notes:
            weight_sum_with_combo += note.weight * Fraction(min(10, math.floor((note.combo_number - 1) / 100)) + 100, 100)
        
        return weight_sum_with_combo / weight_sum * play_level_multiplier
    
    def get_solo_skill_scores_coverages(self, skill_times=(5, 5, 5, 5, 5, 5)):
        
        weight_sum = sum(note.weight for note in self.playable_notes)
        play_level_multiplier = Fraction(max(0, self.play_level - 5) + 200, 200)
        
        self.skill_notes.sort(key=lambda x: x.offset)
        scores_coverages = []
        for skill_time, skill_note in zip(skill_times, self.skill_notes):
            scores_coverage = 0
            for note in self.playable_notes:
                # if skill_note.time_offset = 10, skill_time = 5 => cover notes in [10, 15)
                if skill_note.time_offset <= note.time_offset < skill_note.time_offset + skill_time:
                    scores_coverage += note.weight * Fraction(min(10, math.floor((note.combo_number - 1) / 100)) + 100, 100)
            scores_coverages.append(scores_coverage / weight_sum * play_level_multiplier)
                    
        return scores_coverages
    
    def to_json(self):
        
        playable_note_json_strs = [playable_note.to_json() for playable_note in self.playable_notes]
        skill_note_json_strs = [skill_note.to_json() for skill_note in self.skill_notes]
        prepare_note_json_strs = [prepare_note.to_json() for prepare_note in self.prepare_notes]
        bpm_event_json_strs = [bpm_event.to_json() for bpm_event in self.bpm_events]
        
        return {
            'music_id': self.music_id,
            'music_difficulty': self.music_difficulty,
            'play_level': self.play_level,
            'note_count': self.note_count,
            'playable_notes': playable_note_json_strs,
            'skill_notes': skill_note_json_strs,
            'prepare_notes': prepare_note_json_strs,
            'bpm_change_events': bpm_event_json_strs
        }