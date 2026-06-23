const desc = `The Offline Adaptive Code Review & Skill Assessment Engine is an intelligent, fully offline code evaluation system designed to analyze how a programmer solves a problem rather than simply checking whether the final answer is correct. Unlike traditional coding platforms that rely solely on test case validation, this engine performs deep static code analysis to understand the programming concepts, algorithms, coding practices, optimization techniques, and problem-solving approach used in a solution.

The primary objective is to replicate the behavior of an experienced programming mentor by automatically reviewing source code, identifying strengths and weaknesses across programming topics, maintaining a continuously evolving skill profile for each learner, and generating personalized coding challenges that progressively improve the learner's abilities.

The engine operates entirely offline without requiring internet connectivity or external AI APIs. All parsing, analysis, scoring, recommendation generation, and user profiling are performed locally.

---

# Primary Goals

The system should be capable of answering the following questions after every code submission:

* Is the solution correct?
* Does the solution satisfy the constraints specified in the question?
* Which programming concepts were used?
* Which required concepts were ignored?
* Which unnecessary concepts were introduced?
* Is the chosen algorithm optimal?
* What is the estimated time complexity?
* What is the estimated space complexity?
* Does the code follow good programming practices?
* Which programming topics is the user becoming stronger in?
* Which topics require additional practice?
* What should be the next problem the user attempts?

Rather than assigning a single score, the engine continuously builds a detailed knowledge profile of every learner.

---

# Core Philosophy

The system evaluates **how the solution was written**, not just **what output it produces**.

For example:

Question:

> Reverse a string using recursion.

Traditional Judge:

* Correct Output → Pass

Adaptive Review Engine:

* Output Correct
* Recursion Not Used
* Loop Used Instead
* Constraint Violated
* Recursion Skill Reduced
* Iteration Skill Increased
* Recommend another recursion problem

The learner therefore receives meaningful educational feedback instead of a simple "Accepted."

---

# System Workflow

The review process consists of multiple analysis stages.

Problem Selection

↓

User Writes Code

↓

Code Parser

↓

Abstract Syntax Tree Generation

↓

Static Code Analysis

↓

Concept Detection

↓

Constraint Verification

↓

Algorithm Recognition

↓

Complexity Analysis

↓

Code Quality Analysis

↓

Scoring Engine

↓

Skill Profile Update

↓

Weakness Detection

↓

Adaptive Recommendation Engine

↓

Next Personalized Question

Each stage contributes additional information to the learner profile.

---

# Problem Database

Every coding problem is represented by structured metadata rather than only a title and description.

Each problem contains:

Problem ID

Title

Problem Statement

Difficulty Level

Programming Language Support

Required Concepts

Optional Concepts

Forbidden Concepts

Expected Algorithm

Maximum Allowed Time Complexity

Maximum Allowed Space Complexity

Expected Design Pattern

Learning Objective

Prerequisite Topics

Estimated Completion Time

Tags

Hints

Sample Inputs

Sample Outputs

Hidden Test Cases

Public Test Cases

Example:

Problem

Reverse a String using Recursion

Difficulty

2

Required Concept

Recursion

Forbidden Concepts

For Loop

While Loop

Expected Algorithm

Recursive String Traversal

Maximum Complexity

O(n)

Learning Objective

Understanding Recursive Calls

Tags

Strings

Recursion

Base Case

---

# Source Code Parsing

The engine first converts source code into an Abstract Syntax Tree (AST).

Raw source code is difficult to analyze because variable names and formatting differ between programmers.

AST provides a language-independent representation.

Example:

User code:

for(int i=0;i<n;i++)

AST:

ForStatement

Initialization

Condition

Increment

Body

Recursive function:

factorial(n-1)

AST:

MethodInvocation

↓

RecursiveCall

↓

Argument

↓

BinaryExpression

The AST allows the engine to understand program structure rather than text.

---

# Static Code Analysis

The static analyzer extracts every important programming construct.

It identifies:

Variables

Constants

Functions

Classes

Interfaces

Objects

Arrays

Strings

Loops

Recursion

Conditionals

Switch Statements

Collections

Hash Maps

Stacks

Queues

Trees

Graphs

Exception Handling

Threads

Synchronization

Lambda Expressions

Streams

Generics

Pointers

Memory Allocation

Templates

Namespaces

Inheritance

Polymorphism

Encapsulation

Design Patterns

The analyzer also measures:

* Number of loops
* Nested loop depth
* Number of recursive calls
* Function length
* Variable count
* Cyclomatic complexity
* Return paths
* Dead code
* Duplicate code

---

# Concept Detection Engine

Every programming topic is detected automatically.

Examples include:

Arrays

Strings

Loops

Recursion

Backtracking

Hash Maps

Sliding Window

Two Pointers

Sorting

Searching

Binary Search

Trees

Graphs

Depth First Search

Breadth First Search

Greedy Algorithms

Dynamic Programming

Memoization

Bit Manipulation

Object-Oriented Programming

Concurrency

Database Operations

File Handling

Networking

Regular Expressions

The engine records which concepts appear in the submitted solution.

---

# Constraint Verification

Every coding problem specifies constraints.

Example:

Required

Recursion

Forbidden

Loops

The engine verifies:

Was recursion used?

YES

↓

Was a base case present?

YES

↓

Were loops used?

YES

↓

Constraint Violated

Penalty is applied even if the output is correct.

---

Another example:

Question:

Solve using Binary Search

Student:

Linear Search

Output:

Correct

Constraint Failed

Binary Search Skill Reduced

Linear Search Skill Increased

---

# Algorithm Recognition

The engine recognizes the algorithm independently of variable names.

Supported algorithms include:

Bubble Sort

Selection Sort

Insertion Sort

Merge Sort

Quick Sort

Heap Sort

Binary Search

DFS

BFS

Dijkstra

Bellman Ford

Floyd Warshall

Trie

Segment Tree

Fenwick Tree

Union Find

Sliding Window

Two Pointer

Greedy

Dynamic Programming

Memoization

Backtracking

Branch and Bound

Recursion

Hashing

The engine compares the recognized algorithm with the expected algorithm.

---

# Complexity Analyzer

The engine estimates computational complexity.

Time Complexity

O(1)

O(log n)

O(n)

O(n log n)

O(n²)

O(n³)

O(2ⁿ)

O(n!)

Space Complexity

O(1)

O(log n)

O(n)

O(n²)

If the estimated complexity exceeds the expected limit, optimization points are deducted.

---

# Code Quality Analyzer

The quality analyzer evaluates maintainability.

Checks include:

Meaningful variable names

Method decomposition

Function length

Magic numbers

Unused variables

Unused methods

Duplicate code

Nested conditional depth

Comment quality

Formatting

Naming conventions

Code consistency

Exception handling

Modularity

Readability

Maintainability

---

# Scoring Engine

Every submission receives a weighted score.

Example weights:

Correctness

40%

Required Concepts

25%

Constraint Satisfaction

10%

Algorithm Choice

10%

Optimization

5%

Code Quality

5%

Style

5%

Final Score:

91/100

---

# Skill Assessment Engine

Instead of a single rating, every programming topic has an independent skill score.

Example:

Arrays

92

Strings

88

Loops

95

Hash Maps

82

Sorting

90

Searching

87

Recursion

34

Dynamic Programming

22

Graphs

41

Trees

63

Greedy

55

Backtracking

18

Each submission updates only the relevant topics.

---

# Learning Profile

Over time the engine identifies long-term learning patterns.

Example:

Strong in iterative thinking

Weak in recursive thinking

Often chooses brute-force algorithms

Uses nested loops frequently

Avoids recursion

Good optimization skills

Excellent variable naming

Poor modularization

Rarely writes helper functions

Frequently ignores constraints

This profile evolves continuously.

---

# Adaptive Difficulty Engine

The recommendation engine never jumps from beginner to expert.

Instead, each topic has multiple mastery levels.

Example:

Recursion

Current Level

2

Next Question

Level 3

↓

Pass

↓

Level 4

↓

Pass

↓

Level 5

The learner always receives a question approximately one difficulty level above their demonstrated ability.

---

# Recommendation Engine

After each submission, the engine generates the next coding challenge based on:

* Current skill levels
* Recent mistakes
* Weakest programming topic
* Learning history
* Success rate
* Concept dependencies
* Difficulty progression

Example:

Current Skills:

Arrays

90

Strings

84

Loops

95

Recursion

28

Recommended progression:

Easy Recursive Sum

↓

Recursive String Reverse

↓

Recursive Palindrome

↓

Recursive Binary Search

↓

Binary Tree Traversal

↓

Backtracking

The learner progresses naturally without being overwhelmed.

---

# User Dashboard

The engine maintains a complete learning record.

Dashboard includes:

* Overall programming score
* Topic-wise skill graph
* Recent submissions
* Mistake history
* Concept mastery levels
* Difficulty progression
* Accuracy percentage
* Algorithm usage statistics
* Complexity trends
* Learning recommendations
* Estimated interview readiness

---

# Local Storage

Since the engine is fully offline, all information is stored locally.

Stored data includes:

* User profiles
* Skill scores
* Submission history
* Question database
* Review reports
* Learning statistics
* Adaptive learning state
* Concept graphs
* Algorithm usage history

A local database such as SQLite is sufficient.

---

# Offline Architecture

               +---------------------------+
               |      Question Database    |
               +-------------+-------------+
                             |
                             v
                 +------------------------+
                 | Problem Selection      |
                 +------------+-----------+
                              |
                              v
                 +------------------------+
                 | Code Parser (AST)      |
                 +------------+-----------+
                              |
                              v
         +-------------------------------------------+
         | Static Analysis Engine                    |
         | - Syntax Analysis                         |
         | - Concept Detection                       |
         | - Algorithm Recognition                   |
         | - Constraint Verification                 |
         | - Complexity Estimation                   |
         | - Style Analysis                          |
         +------------------+------------------------+
                            |
                            v
                 +------------------------+
                 | Scoring Engine         |
                 +------------+-----------+
                              |
                              v
                 +------------------------+
                 | Skill Assessment       |
                 +------------+-----------+
                              |
                              v
                 +------------------------+
                 | User Skill Database    |
                 +------------+-----------+
                              |
                              v
                 +------------------------+
                 | Recommendation Engine  |
                 +------------+-----------+
                              |
                              v
                 +------------------------+
                 | Next Personalized Task |
                 +------------------------+

---

# Expected Outcome

The engine should function as a personal programming mentor rather than a simple code evaluator. Every submission contributes to a richer understanding of the learner's abilities, enabling personalized guidance, targeted practice, and measurable progress over time.

Instead of merely telling a learner that their solution is correct or incorrect, the system explains why it is good or deficient, identifies the underlying programming concepts involved, updates a detailed skill model, and selects the next challenge to maximize learning efficiency. Over hundreds of submissions, the engine builds a comprehensive map of the learner's programming proficiency across algorithms, data structures, software design, and coding practices, all while operating completely offline. This transforms the platform from a coding judge into an intelligent, adaptive learning environment.`;

async function run() {
  const res = await fetch("http://localhost:3000/api/contextforge/discover", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectName: "Engine", description: desc, platform: "web" })
  });
  if (res.ok) {
    console.log(JSON.stringify(await res.json(), null, 2));
  } else {
    console.log("Error:", res.status, await res.text());
  }
}
run();
