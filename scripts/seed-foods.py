#!/usr/bin/env python3
"""
seed-foods.py — insert ~200 common foods into the `foods` reference table.

Nutrition values are per-100g unless serving_g suggests otherwise (e.g. eggs
use per-1-large-egg). All values are approximate, drawn from USDA FoodData
Central common-ranges. Purpose is coverage of the 90% of foods people log —
not clinical precision. Users log custom foods for anything not here.

Rerunnable: uses ON CONFLICT (id) DO UPDATE so re-seeding refreshes values
without duplicating rows.

Usage:
  python3 scripts/seed-foods.py
"""
from __future__ import annotations
import os
import subprocess
import sys
import urllib.parse
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent


# Format: (id, name, brand, serving_g, serving_label, kcal, p, c, f, fiber, sugar, sodium, cholesterol, category)
FOODS: list[tuple] = [
    # ── Proteins ─────────────────────────────────────────────────────
    ("chicken-breast-cooked", "Chicken breast, cooked", None, 100, "100 g", 165, 31, 0, 3.6, 0, 0, 74, 85, "protein"),
    ("chicken-thigh-cooked", "Chicken thigh, cooked", None, 100, "100 g", 209, 26, 0, 10.9, 0, 0, 88, 130, "protein"),
    ("ground-beef-85", "Ground beef, 85% lean, cooked", None, 100, "100 g", 250, 26, 0, 15, 0, 0, 75, 88, "protein"),
    ("ground-beef-93", "Ground beef, 93% lean, cooked", None, 100, "100 g", 179, 22, 0, 10, 0, 0, 66, 76, "protein"),
    ("salmon-cooked", "Salmon, cooked", None, 100, "100 g", 208, 20, 0, 13, 0, 0, 59, 63, "protein"),
    ("tuna-canned-water", "Tuna, canned in water", None, 100, "100 g", 116, 26, 0, 1, 0, 0, 247, 30, "protein"),
    ("egg-large", "Egg, large, whole", None, 50, "1 large (50 g)", 72, 6, 0.4, 5, 0, 0.2, 71, 186, "protein"),
    ("egg-white-large", "Egg white, large", None, 33, "1 large (33 g)", 17, 3.6, 0.2, 0.1, 0, 0.2, 55, 0, "protein"),
    ("greek-yogurt-nonfat-plain", "Greek yogurt, plain, nonfat", None, 170, "1 cup (170 g)", 100, 17, 6, 0.7, 0, 6, 60, 5, "protein"),
    ("greek-yogurt-2pct-plain", "Greek yogurt, plain, 2%", None, 170, "1 cup (170 g)", 150, 15, 8, 4, 0, 7, 65, 15, "protein"),
    ("cottage-cheese-1pct", "Cottage cheese, 1% low-fat", None, 100, "100 g", 72, 12, 3, 1, 0, 3, 406, 5, "protein"),
    ("tofu-firm", "Tofu, firm", None, 100, "100 g", 144, 17, 3, 9, 2, 1, 12, 0, "protein"),
    ("tempeh", "Tempeh", None, 100, "100 g", 193, 20, 8, 11, 0, 0, 9, 0, "protein"),
    ("turkey-breast-cooked", "Turkey breast, cooked", None, 100, "100 g", 135, 30, 0, 1, 0, 0, 55, 65, "protein"),
    ("pork-tenderloin-cooked", "Pork tenderloin, cooked", None, 100, "100 g", 143, 26, 0, 3.5, 0, 0, 61, 74, "protein"),
    ("shrimp-cooked", "Shrimp, cooked", None, 100, "100 g", 99, 24, 0.2, 0.3, 0, 0, 111, 189, "protein"),
    ("cod-cooked", "Cod, cooked", None, 100, "100 g", 105, 23, 0, 0.9, 0, 0, 78, 55, "protein"),
    ("bacon-cooked", "Bacon, cooked", None, 10, "1 slice (10 g)", 43, 3, 0.1, 3.3, 0, 0, 190, 11, "protein"),
    ("ham-deli", "Ham, deli-sliced", None, 28, "1 slice (28 g)", 34, 5, 1, 1, 0, 1, 383, 15, "protein"),
    ("turkey-deli", "Turkey, deli-sliced", None, 28, "1 slice (28 g)", 30, 5.5, 0.6, 0.4, 0, 0.5, 335, 13, "protein"),
    ("whey-protein-scoop", "Whey protein powder, 1 scoop", "Generic", 30, "1 scoop (30 g)", 120, 24, 3, 1.5, 0, 2, 60, 40, "protein"),
    ("sausage-link", "Pork sausage, 1 link", None, 68, "1 link (68 g)", 210, 12, 1, 17, 0, 0, 450, 47, "protein"),

    # ── Grains + starches ─────────────────────────────────────────────
    ("oats-rolled-dry", "Oats, rolled, dry", None, 40, "1/2 cup dry (40 g)", 150, 5, 27, 3, 4, 1, 0, 0, "grain"),
    ("rice-white-cooked", "White rice, cooked", None, 158, "1 cup (158 g)", 205, 4, 45, 0.4, 0.6, 0, 2, 0, "grain"),
    ("rice-brown-cooked", "Brown rice, cooked", None, 195, "1 cup (195 g)", 216, 5, 45, 1.8, 3.5, 0.7, 10, 0, "grain"),
    ("quinoa-cooked", "Quinoa, cooked", None, 185, "1 cup (185 g)", 222, 8, 39, 4, 5, 1.6, 13, 0, "grain"),
    ("bread-whole-wheat", "Bread, whole wheat", None, 28, "1 slice (28 g)", 69, 3.6, 12, 1, 2, 1.6, 132, 0, "grain"),
    ("bread-white", "Bread, white", None, 25, "1 slice (25 g)", 66, 2, 13, 0.8, 0.6, 1.4, 132, 0, "grain"),
    ("bagel-plain", "Bagel, plain", None, 105, "1 medium (105 g)", 289, 11, 56, 1.8, 2.4, 6, 561, 0, "grain"),
    ("english-muffin", "English muffin", None, 57, "1 (57 g)", 134, 4, 26, 1, 2, 2, 264, 0, "grain"),
    ("tortilla-flour-10in", "Tortilla, flour, 10-inch", None, 64, "1 (64 g)", 214, 6, 36, 5, 1.4, 1, 391, 0, "grain"),
    ("tortilla-corn-6in", "Tortilla, corn, 6-inch", None, 24, "1 (24 g)", 52, 1.4, 11, 0.7, 1.5, 0.2, 11, 0, "grain"),
    ("pasta-cooked", "Pasta, cooked", None, 140, "1 cup (140 g)", 220, 8, 43, 1.3, 2.5, 1, 1, 0, "grain"),
    ("cereal-cheerios", "Cheerios cereal", "General Mills", 28, "1 cup (28 g)", 100, 3, 20, 2, 3, 1, 140, 0, "grain"),
    ("cereal-granola", "Granola cereal", None, 55, "1/2 cup (55 g)", 250, 6, 36, 10, 4, 12, 15, 0, "grain"),
    ("crackers-saltine", "Saltine crackers", None, 15, "5 crackers (15 g)", 62, 1.5, 11, 1.4, 0.5, 0, 165, 0, "grain"),
    ("pancake", "Pancake, plain", None, 38, "1 (38 g)", 86, 2, 11, 3.7, 0.3, 2, 167, 21, "grain"),

    # ── Vegetables ────────────────────────────────────────────────────
    ("broccoli-raw", "Broccoli, raw", None, 100, "100 g", 34, 2.8, 7, 0.4, 2.6, 1.7, 33, 0, "veg"),
    ("spinach-raw", "Spinach, raw", None, 30, "1 cup (30 g)", 7, 0.9, 1, 0.1, 0.7, 0.1, 24, 0, "veg"),
    ("kale-raw", "Kale, raw", None, 100, "100 g", 49, 4.3, 9, 0.9, 3.6, 2.3, 38, 0, "veg"),
    ("carrot-medium", "Carrot, medium", None, 61, "1 medium (61 g)", 25, 0.6, 6, 0.1, 1.7, 2.9, 42, 0, "veg"),
    ("tomato-medium", "Tomato, medium", None, 123, "1 medium (123 g)", 22, 1.1, 4.8, 0.2, 1.5, 3.2, 6, 0, "veg"),
    ("bell-pepper-red", "Bell pepper, red, 1 medium", None, 119, "1 medium (119 g)", 37, 1.2, 7, 0.4, 2.5, 5, 5, 0, "veg"),
    ("cucumber-medium", "Cucumber, 1 medium", None, 201, "1 medium (201 g)", 30, 1.3, 7.2, 0.2, 1, 3.4, 4, 0, "veg"),
    ("lettuce-romaine", "Romaine lettuce", None, 47, "1 cup (47 g)", 8, 0.6, 1.5, 0.1, 1, 0.6, 4, 0, "veg"),
    ("onion-cup-chopped", "Onion, chopped, 1 cup", None, 160, "1 cup (160 g)", 64, 1.8, 15, 0.2, 2.7, 6.8, 6, 0, "veg"),
    ("mushrooms-raw", "Mushrooms, white, raw", None, 96, "1 cup (96 g)", 21, 3, 3.1, 0.3, 1, 2, 5, 0, "veg"),
    ("zucchini-medium", "Zucchini, 1 medium", None, 196, "1 medium (196 g)", 33, 2.4, 6.1, 0.6, 2, 4.9, 16, 0, "veg"),
    ("sweet-potato-baked", "Sweet potato, baked, 1 medium", None, 114, "1 medium (114 g)", 103, 2.3, 24, 0.2, 3.8, 7.4, 41, 0, "veg"),
    ("potato-baked", "Potato, baked, 1 medium", None, 173, "1 medium (173 g)", 161, 4.3, 37, 0.2, 3.8, 2, 17, 0, "veg"),
    ("corn-cup-cooked", "Corn, cooked, 1 cup", None, 154, "1 cup (154 g)", 132, 5, 29, 2, 4, 5, 24, 0, "veg"),
    ("peas-cup-cooked", "Green peas, cooked, 1 cup", None, 160, "1 cup (160 g)", 134, 9, 25, 0.4, 8.8, 9.5, 5, 0, "veg"),
    ("cauliflower-cup-raw", "Cauliflower, raw, 1 cup", None, 107, "1 cup (107 g)", 27, 2, 5, 0.3, 2, 2, 32, 0, "veg"),
    ("asparagus-cup-cooked", "Asparagus, cooked, 1 cup", None, 180, "1 cup (180 g)", 40, 4.3, 7, 0.4, 3.6, 2.4, 26, 0, "veg"),
    ("brussels-sprouts-cup", "Brussels sprouts, cooked, 1 cup", None, 156, "1 cup (156 g)", 56, 4, 11, 0.8, 4, 2.7, 33, 0, "veg"),
    ("cabbage-cup", "Cabbage, chopped, 1 cup", None, 89, "1 cup (89 g)", 22, 1.1, 5.2, 0.1, 2.2, 2.9, 16, 0, "veg"),

    # ── Fruits ────────────────────────────────────────────────────────
    ("banana-medium", "Banana, medium", None, 118, "1 medium (118 g)", 105, 1.3, 27, 0.4, 3.1, 14, 1, 0, "fruit"),
    ("apple-medium", "Apple, medium", None, 182, "1 medium (182 g)", 95, 0.5, 25, 0.3, 4.4, 19, 2, 0, "fruit"),
    ("orange-medium", "Orange, medium", None, 131, "1 medium (131 g)", 62, 1.2, 15, 0.2, 3.1, 12, 0, 0, "fruit"),
    ("strawberries-cup", "Strawberries, sliced, 1 cup", None, 152, "1 cup (152 g)", 49, 1, 12, 0.5, 3, 7, 2, 0, "fruit"),
    ("blueberries-cup", "Blueberries, 1 cup", None, 148, "1 cup (148 g)", 84, 1.1, 21, 0.5, 3.6, 15, 1, 0, "fruit"),
    ("raspberries-cup", "Raspberries, 1 cup", None, 123, "1 cup (123 g)", 64, 1.5, 15, 0.8, 8, 5.4, 1, 0, "fruit"),
    ("blackberries-cup", "Blackberries, 1 cup", None, 144, "1 cup (144 g)", 62, 2, 14, 0.7, 8, 7, 1, 0, "fruit"),
    ("mango-cup", "Mango, sliced, 1 cup", None, 165, "1 cup (165 g)", 99, 1.4, 25, 0.6, 2.6, 23, 2, 0, "fruit"),
    ("pineapple-cup", "Pineapple, chunks, 1 cup", None, 165, "1 cup (165 g)", 82, 0.9, 22, 0.2, 2.3, 16, 2, 0, "fruit"),
    ("grapes-cup", "Grapes, 1 cup", None, 151, "1 cup (151 g)", 104, 1.1, 27, 0.2, 1.4, 23, 3, 0, "fruit"),
    ("watermelon-cup", "Watermelon, diced, 1 cup", None, 152, "1 cup (152 g)", 46, 0.9, 12, 0.2, 0.6, 9.5, 2, 0, "fruit"),
    ("peach-medium", "Peach, medium", None, 150, "1 medium (150 g)", 58, 1.4, 14, 0.4, 2.3, 13, 0, 0, "fruit"),
    ("pear-medium", "Pear, medium", None, 178, "1 medium (178 g)", 101, 0.6, 27, 0.3, 5.5, 17, 2, 0, "fruit"),
    ("kiwi-medium", "Kiwi, medium", None, 69, "1 medium (69 g)", 42, 0.8, 10, 0.4, 2.1, 6.2, 2, 0, "fruit"),
    ("avocado-half", "Avocado, 1/2 medium", None, 68, "1/2 medium (68 g)", 114, 1.4, 6, 10.5, 4.6, 0.5, 5, 0, "fruit"),

    # ── Dairy ─────────────────────────────────────────────────────────
    ("milk-whole-1cup", "Milk, whole, 1 cup", None, 244, "1 cup (244 g)", 149, 8, 12, 8, 0, 12, 105, 24, "dairy"),
    ("milk-skim-1cup", "Milk, skim, 1 cup", None, 245, "1 cup (245 g)", 83, 8, 12, 0.2, 0, 12, 103, 5, "dairy"),
    ("milk-almond-unsw-1cup", "Almond milk, unsweetened, 1 cup", None, 240, "1 cup (240 g)", 30, 1, 1, 2.5, 0.5, 0, 180, 0, "dairy"),
    ("milk-oat-1cup", "Oat milk, 1 cup", None, 240, "1 cup (240 g)", 120, 3, 16, 5, 2, 7, 100, 0, "dairy"),
    ("cheddar-cheese", "Cheddar cheese", None, 28, "1 oz (28 g)", 115, 7, 0.4, 9.5, 0, 0.1, 180, 30, "dairy"),
    ("mozzarella-cheese", "Mozzarella cheese, part-skim", None, 28, "1 oz (28 g)", 72, 6.9, 0.8, 4.5, 0, 0.3, 175, 18, "dairy"),
    ("parmesan-cheese", "Parmesan cheese, grated", None, 5, "1 tbsp (5 g)", 22, 2, 0.2, 1.4, 0, 0, 76, 4, "dairy"),
    ("cream-cheese", "Cream cheese", None, 30, "2 tbsp (30 g)", 100, 2, 1, 10, 0, 1, 90, 30, "dairy"),
    ("butter", "Butter", None, 14, "1 tbsp (14 g)", 102, 0.1, 0, 11.5, 0, 0, 91, 31, "fat"),
    ("sour-cream", "Sour cream, regular", None, 30, "2 tbsp (30 g)", 60, 1, 1, 6, 0, 1, 15, 20, "dairy"),

    # ── Fats + oils ───────────────────────────────────────────────────
    ("olive-oil", "Olive oil", None, 14, "1 tbsp (14 g)", 119, 0, 0, 13.5, 0, 0, 0, 0, "fat"),
    ("coconut-oil", "Coconut oil", None, 14, "1 tbsp (14 g)", 121, 0, 0, 13.5, 0, 0, 0, 0, "fat"),
    ("mayo", "Mayonnaise", None, 14, "1 tbsp (14 g)", 94, 0.1, 0.6, 10, 0, 0.2, 88, 5, "fat"),
    ("mayo-light", "Mayonnaise, light", None, 15, "1 tbsp (15 g)", 45, 0, 1, 4.5, 0, 1, 100, 5, "fat"),
    ("peanut-butter", "Peanut butter, smooth", None, 32, "2 tbsp (32 g)", 190, 8, 6, 16, 3, 3, 140, 0, "fat"),
    ("almond-butter", "Almond butter", None, 32, "2 tbsp (32 g)", 196, 6.7, 6.6, 18, 3.4, 1.5, 72, 0, "fat"),
    ("ghee", "Ghee", None, 14, "1 tbsp (14 g)", 123, 0, 0, 14, 0, 0, 0, 33, "fat"),

    # ── Nuts + seeds ──────────────────────────────────────────────────
    ("almonds", "Almonds, raw", None, 28, "1 oz (28 g)", 164, 6, 6, 14, 3.5, 1.2, 0, 0, "fat"),
    ("walnuts", "Walnuts", None, 28, "1 oz (28 g)", 185, 4.3, 3.9, 18.5, 1.9, 0.7, 1, 0, "fat"),
    ("cashews", "Cashews, raw", None, 28, "1 oz (28 g)", 157, 5, 8.6, 12, 0.9, 1.7, 3, 0, "fat"),
    ("peanuts", "Peanuts, roasted", None, 28, "1 oz (28 g)", 166, 7, 4.5, 14, 2.4, 1.2, 90, 0, "fat"),
    ("chia-seeds", "Chia seeds", None, 12, "1 tbsp (12 g)", 60, 2, 5, 3.8, 4.1, 0, 0, 0, "fat"),
    ("flax-seeds", "Flax seeds", None, 10, "1 tbsp (10 g)", 55, 1.9, 3, 4.3, 2.8, 0.2, 3, 0, "fat"),
    ("hemp-seeds", "Hemp seeds", None, 30, "3 tbsp (30 g)", 166, 10, 2.6, 15, 1.2, 0.5, 2, 0, "fat"),
    ("pumpkin-seeds", "Pumpkin seeds", None, 28, "1 oz (28 g)", 158, 8.5, 3, 14, 1.7, 0.4, 5, 0, "fat"),
    ("sunflower-seeds", "Sunflower seeds", None, 28, "1 oz (28 g)", 165, 5.5, 6.8, 14.5, 3, 0.8, 3, 0, "fat"),

    # ── Legumes ───────────────────────────────────────────────────────
    ("black-beans-cup", "Black beans, cooked, 1 cup", None, 172, "1 cup (172 g)", 227, 15, 41, 0.9, 15, 0.6, 2, 0, "protein"),
    ("chickpeas-cup", "Chickpeas, cooked, 1 cup", None, 164, "1 cup (164 g)", 269, 15, 45, 4.3, 12.5, 8, 11, 0, "protein"),
    ("lentils-cup", "Lentils, cooked, 1 cup", None, 198, "1 cup (198 g)", 230, 18, 40, 0.8, 15.6, 3.6, 4, 0, "protein"),
    ("kidney-beans-cup", "Kidney beans, cooked, 1 cup", None, 177, "1 cup (177 g)", 225, 15, 40, 0.9, 13.1, 0.6, 2, 0, "protein"),
    ("edamame-cup", "Edamame, shelled, 1 cup", None, 155, "1 cup (155 g)", 189, 17, 15, 8, 8, 3.4, 9, 0, "protein"),
    ("hummus-2tbsp", "Hummus, 2 tbsp", None, 30, "2 tbsp (30 g)", 70, 2, 6, 5, 2, 0, 130, 0, "protein"),

    # ── Sweets + snacks ───────────────────────────────────────────────
    ("dark-chocolate-1oz", "Dark chocolate, 70%", None, 28, "1 oz (28 g)", 170, 2.2, 13, 12, 3, 6.8, 5, 2, "sweet"),
    ("milk-chocolate-1oz", "Milk chocolate", None, 28, "1 oz (28 g)", 152, 2.2, 17, 8.6, 1, 15, 24, 6, "sweet"),
    ("ice-cream-vanilla", "Ice cream, vanilla, 1/2 cup", None, 66, "1/2 cup (66 g)", 137, 2.3, 16, 7.3, 0.5, 14, 53, 29, "sweet"),
    ("cookie-chocolate-chip", "Chocolate chip cookie", None, 16, "1 medium (16 g)", 78, 0.9, 9.3, 4.5, 0.3, 5, 55, 5, "sweet"),
    ("muffin-blueberry", "Blueberry muffin, medium", None, 113, "1 medium (113 g)", 313, 6.3, 54, 7.3, 1.6, 25, 505, 34, "sweet"),
    ("donut-glazed", "Donut, glazed", None, 60, "1 medium (60 g)", 260, 4, 31, 14, 1, 12, 220, 5, "sweet"),
    ("chips-potato", "Potato chips", None, 28, "1 oz (28 g)", 152, 2, 15, 10, 1.3, 0.1, 148, 0, "sweet"),
    ("crackers-goldfish", "Cheddar crackers", "Goldfish", 30, "55 pieces (30 g)", 140, 3, 20, 5, 0.5, 0, 250, 5, "sweet"),
    ("popcorn-air-popped", "Popcorn, air-popped, 3 cups", None, 24, "3 cups (24 g)", 93, 3, 19, 1.1, 3.5, 0.2, 2, 0, "sweet"),
    ("granola-bar", "Granola bar", None, 42, "1 bar (42 g)", 190, 3, 29, 7, 2, 12, 130, 0, "sweet"),
    ("protein-bar-quest", "Protein bar", "Quest", 60, "1 bar (60 g)", 200, 21, 22, 8, 14, 1, 300, 5, "sweet"),

    # ── Drinks ────────────────────────────────────────────────────────
    ("coffee-black", "Coffee, black", None, 240, "1 cup (240 ml)", 2, 0.3, 0, 0, 0, 0, 5, 0, "drink"),
    ("latte-whole", "Latte, whole milk, medium", None, 480, "16 oz (480 ml)", 190, 12, 18, 7, 0, 18, 150, 40, "drink"),
    ("tea-black", "Tea, black, plain", None, 240, "1 cup (240 ml)", 2, 0, 0.7, 0, 0, 0, 7, 0, "drink"),
    ("orange-juice-cup", "Orange juice, 1 cup", None, 240, "1 cup (240 ml)", 112, 1.7, 26, 0.5, 0.5, 21, 2, 0, "drink"),
    ("apple-juice-cup", "Apple juice, 1 cup", None, 240, "1 cup (240 ml)", 114, 0.2, 28, 0.3, 0.5, 24, 10, 0, "drink"),
    ("soda-coke", "Coca-Cola, 12 oz can", "Coke", 355, "12 oz (355 ml)", 140, 0, 39, 0, 0, 39, 45, 0, "drink"),
    ("soda-diet-coke", "Diet Coke, 12 oz can", "Coke", 355, "12 oz (355 ml)", 0, 0, 0, 0, 0, 0, 40, 0, "drink"),
    ("sparkling-water", "Sparkling water, plain", None, 355, "12 oz (355 ml)", 0, 0, 0, 0, 0, 0, 5, 0, "drink"),
    ("beer-light", "Light beer, 12 oz", None, 355, "12 oz (355 ml)", 103, 0.9, 5.8, 0, 0, 0, 14, 0, "drink"),
    ("beer-regular", "Beer, regular, 12 oz", None, 355, "12 oz (355 ml)", 153, 1.6, 12.6, 0, 0, 0, 14, 0, "drink"),
    ("wine-red", "Red wine, 5 oz", None, 148, "5 oz (148 ml)", 125, 0.1, 3.8, 0, 0, 0.9, 6, 0, "drink"),
    ("wine-white", "White wine, 5 oz", None, 148, "5 oz (148 ml)", 121, 0.1, 3.8, 0, 0, 1.4, 7, 0, "drink"),
    ("gatorade-20oz", "Gatorade, 20 oz", "Gatorade", 591, "20 oz (591 ml)", 140, 0, 36, 0, 0, 34, 270, 0, "drink"),
    ("energy-drink-monster", "Monster Energy, 16 oz", "Monster", 473, "16 oz (473 ml)", 210, 0, 54, 0, 0, 54, 370, 0, "drink"),
    ("kombucha-cup", "Kombucha, 1 cup", None, 240, "1 cup (240 ml)", 30, 0, 7, 0, 0, 4, 10, 0, "drink"),

    # ── Fast food + restaurant ────────────────────────────────────────
    ("pizza-cheese-slice", "Pizza, cheese, 1 slice", None, 107, "1 slice (107 g)", 285, 12, 36, 10, 2.5, 3.8, 640, 18, "grain"),
    ("pizza-pepperoni-slice", "Pizza, pepperoni, 1 slice", None, 111, "1 slice (111 g)", 313, 13, 36, 13, 2.4, 3.8, 760, 22, "grain"),
    ("burger-single", "Fast-food burger, plain", None, 154, "1 burger (154 g)", 354, 17, 33, 17, 1.4, 6, 497, 41, "protein"),
    ("cheeseburger-single", "Cheeseburger, single", None, 168, "1 burger (168 g)", 396, 20, 33, 20, 1.4, 6, 656, 61, "protein"),
    ("french-fries-medium", "French fries, medium", None, 117, "1 medium (117 g)", 365, 4, 48, 17, 4, 0.3, 246, 0, "veg"),
    ("chicken-nuggets-6", "Chicken nuggets, 6 pc", None, 96, "6 nuggets (96 g)", 260, 15, 15, 16, 0.8, 0.4, 470, 40, "protein"),
    ("hotdog-with-bun", "Hot dog with bun", None, 98, "1 (98 g)", 242, 10, 18, 15, 0.6, 4, 670, 44, "protein"),
    ("burrito-bowl-chicken", "Chipotle-style chicken burrito bowl", None, 500, "1 bowl (~500 g)", 665, 45, 68, 22, 12, 3, 1215, 125, "protein"),
    ("sushi-roll-california", "California roll, 6 pc", None, 176, "6 pc (176 g)", 255, 9, 38, 7, 5, 8, 470, 20, "protein"),
    ("taco-hard-shell", "Hard-shell taco, beef", None, 78, "1 taco (78 g)", 170, 8, 13, 10, 2, 1, 330, 25, "protein"),
    ("burrito-bean-cheese", "Bean and cheese burrito", None, 200, "1 medium (200 g)", 380, 15, 55, 12, 8, 3, 970, 25, "protein"),
    ("pad-thai", "Pad thai, chicken", None, 400, "1 order (~400 g)", 750, 30, 88, 30, 4, 20, 1600, 65, "grain"),
    ("ramen-instant", "Ramen noodles, instant", None, 85, "1 pack (85 g)", 380, 8, 52, 14, 2, 2, 1580, 0, "grain"),
    ("caesar-salad-chicken", "Caesar salad with chicken", None, 300, "1 entree (~300 g)", 470, 32, 12, 32, 3, 3, 900, 90, "veg"),
    ("sub-6in-turkey", "Turkey sub, 6-inch", "Subway", 220, "6-inch (220 g)", 280, 18, 46, 3.5, 5, 8, 810, 25, "grain"),

    # ── Condiments + spreads ──────────────────────────────────────────
    ("ketchup-1tbsp", "Ketchup, 1 tbsp", None, 15, "1 tbsp (15 g)", 15, 0.2, 4, 0, 0.1, 3.4, 154, 0, "sweet"),
    ("mustard-1tsp", "Mustard, yellow, 1 tsp", None, 5, "1 tsp (5 g)", 3, 0.2, 0.3, 0.2, 0.1, 0.1, 55, 0, "sweet"),
    ("soy-sauce-1tbsp", "Soy sauce, 1 tbsp", None, 16, "1 tbsp (16 g)", 8, 1.3, 0.8, 0, 0.1, 0.1, 902, 0, "sweet"),
    ("hot-sauce-1tsp", "Hot sauce, 1 tsp", None, 5, "1 tsp (5 g)", 1, 0.1, 0.1, 0, 0, 0, 124, 0, "sweet"),
    ("salsa-2tbsp", "Salsa, 2 tbsp", None, 30, "2 tbsp (30 g)", 10, 0.4, 2, 0.1, 0.5, 1.3, 130, 0, "veg"),
    ("honey-1tbsp", "Honey, 1 tbsp", None, 21, "1 tbsp (21 g)", 64, 0.1, 17, 0, 0, 17, 1, 0, "sweet"),
    ("maple-syrup-1tbsp", "Maple syrup, 1 tbsp", None, 20, "1 tbsp (20 g)", 52, 0, 13, 0.1, 0, 12, 2, 0, "sweet"),
    ("sugar-white-1tsp", "Sugar, white, 1 tsp", None, 4, "1 tsp (4 g)", 16, 0, 4, 0, 0, 4, 0, 0, "sweet"),
    ("jam-strawberry-1tbsp", "Strawberry jam, 1 tbsp", None, 20, "1 tbsp (20 g)", 56, 0.1, 14, 0, 0.2, 10, 6, 0, "sweet"),
]


def load_env(path: Path) -> dict[str, str]:
    env = {}
    if not path.exists():
        return env
    for line in path.read_text().splitlines():
        s = line.strip()
        if not s or s.startswith('#') or '=' not in s:
            continue
        k, _, v = s.partition('=')
        env[k.strip()] = v.strip()
    return env


def build_db_url(env: dict[str, str]) -> str:
    ref = env.get('SUPABASE_PROJECT_ID')
    pwd = env.get('SUPABASE_DB_PASSWORD')
    if not ref or not pwd:
        sys.exit('Missing SUPABASE_PROJECT_ID or SUPABASE_DB_PASSWORD in apps/web/.env.local')
    return f'postgresql://postgres.{ref}:{urllib.parse.quote(pwd)}@aws-1-eu-west-1.pooler.supabase.com:6543/postgres'


def build_tsv(dst: Path) -> int:
    with dst.open('w', encoding='utf-8') as f:
        for row in FOODS:
            # id, name, brand, serving_g, serving_label, kcal, p, c, f, fiber, sugar, sodium, cholesterol, category
            out = [
                str(row[0]),
                str(row[1]).replace('\t', ' '),
                '' if row[2] is None else str(row[2]).replace('\t', ' '),
                str(row[3]),
                str(row[4]).replace('\t', ' '),
                str(row[5]),
                str(row[6]),
                str(row[7]),
                str(row[8]),
                str(row[9]),
                str(row[10]),
                str(row[11]),
                str(row[12]),
                str(row[13] or ''),
            ]
            f.write('\t'.join(x.replace('\r', '').replace('\n', ' ') for x in out) + '\n')
    return len(FOODS)


def seed(db_url: str, tsv: Path):
    # Load into a temp table then MERGE via ON CONFLICT
    sql = f'''
begin;
create temp table _foods_stage (
  id text, name text, brand text, serving_g numeric, serving_label text,
  kcal numeric, protein_g numeric, carbs_g numeric, fat_g numeric,
  fiber_g numeric, sugar_g numeric, sodium_mg numeric, cholesterol_mg numeric,
  category text
) on commit drop;

\\copy _foods_stage from '{tsv}' with (format csv, delimiter E'\\t', quote E'\\b', null '')

insert into foods (id, name, brand, serving_g, serving_label, kcal, protein_g, carbs_g, fat_g, fiber_g, sugar_g, sodium_mg, cholesterol_mg, category)
select id, name, nullif(brand,''), serving_g, serving_label, kcal, protein_g, carbs_g, fat_g, fiber_g, sugar_g, sodium_mg, cholesterol_mg, nullif(category,'')
from _foods_stage
on conflict (id) do update set
  name = excluded.name,
  brand = excluded.brand,
  serving_g = excluded.serving_g,
  serving_label = excluded.serving_label,
  kcal = excluded.kcal,
  protein_g = excluded.protein_g,
  carbs_g = excluded.carbs_g,
  fat_g = excluded.fat_g,
  fiber_g = excluded.fiber_g,
  sugar_g = excluded.sugar_g,
  sodium_mg = excluded.sodium_mg,
  cholesterol_mg = excluded.cholesterol_mg,
  category = excluded.category;

select 'foods total: ' || count(*) from foods;
select category, count(*) from foods group by category order by 2 desc;
commit;
'''
    result = subprocess.run(
        ['psql', db_url, '-v', 'ON_ERROR_STOP=1'],
        input=sql, text=True, capture_output=True,
    )
    if result.returncode != 0:
        print('STDERR:', result.stderr)
        sys.exit(result.returncode)
    print(result.stdout)


def main():
    env = load_env(REPO_ROOT / 'apps' / 'web' / '.env.local')
    db_url = build_db_url(env)
    working = REPO_ROOT / 'working' / 'foods'
    working.mkdir(parents=True, exist_ok=True)
    tsv = working / 'foods.tsv'
    n = build_tsv(tsv)
    print(f'wrote {n} rows to {tsv}')
    seed(db_url, tsv)


if __name__ == '__main__':
    main()
