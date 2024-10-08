import React, { useState, useMemo, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import PDFJSWorker from 'pdfjs-dist/build/pdf.worker.entry';
import { TextItem } from 'pdfjs-dist/types/src/display/api';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJSWorker;

interface Course {
  quarter: string;
  name: string;
  description: string;
  attempted: number;
  earned: number;
  grade: string;
  points: number;
}

interface ParsedData {
  courses: Course[];
  totalAttemptedCredits: number;
  totalEarnedCredits: number;
  totalGPAUnits: number;
  totalGradePoints: number;
  cumulativeGPA: number;
  quarterlyGPA: { quarter: string; GPA: number }[];
}

const getGradeValue = (grade: string): number => {
  switch (grade) {
    case 'A+': case 'A': return 4.0;
    case 'A-': return 3.7;
    case 'B+': return 3.3;
    case 'B': return 3.0;
    case 'B-': return 2.7;
    case 'C+': return 2.3;
    case 'C': return 2.0;
    case 'C-': return 1.7;
    case 'D+': return 1.3;
    case 'D': return 1.0;
    case 'D-': return 0.7;
    case 'F': return 0.0;
    default: return 0.0;
  }
};

const calculateGPA = (courses: Course[]): number => {
  const totalGPAUnits = courses.reduce((sum, course) => 
    course.grade !== 'P' && course.grade !== 'NP' && course.grade !== 'W' ? sum + course.attempted : sum, 0);
  const totalGradePoints = courses.reduce((sum, course) => sum + course.points, 0);
  return totalGPAUnits > 0 ? totalGradePoints / totalGPAUnits : 0;
};

const quarterOrder = ['Winter', 'Spring', 'Summer', 'Fall'];

const App: React.FC = () => {
  const [parsedData, setParsedData] = useState<ParsedData | null>(null);
  const [rawText, setRawText] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<string>('');
  const [startQuarter, setStartQuarter] = useState<string>('');
  const [endQuarter, setEndQuarter] = useState<string>('');
  const [showInstructions, setShowInstructions] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const parsePDF = async (file: File) => {
    try {
      setDebugInfo('Starting PDF parsing...');
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
      let allTextItems: TextItem[] = [];

      for (let i = 1; i <= pdf.numPages; i++) {
        setDebugInfo(prev => prev + `\nProcessing page ${i} of ${pdf.numPages}`);
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        allTextItems = allTextItems.concat(textContent.items as TextItem[]);
      }

      setDebugInfo(prev => prev + '\nExtracting text and parsing courses...');

      const courses: Course[] = [];
      let currentQuarter = '';
      let currentLine = '';
      let yPosition = 0;

      allTextItems.forEach((item) => {
        if (Math.abs(item.transform[5] - yPosition) > 5) {
          processLine(currentLine, courses, currentQuarter);
          currentLine = '';
          yPosition = item.transform[5];
        }
        currentLine += item.str + ' ';

        const quarterMatch = item.str.match(/(\d{4}\s+\w+\s+Quarter)/);
        if (quarterMatch) {
          currentQuarter = quarterMatch[1];
        }
      });

      processLine(currentLine, courses, currentQuarter);

      setRawText(allTextItems.map(item => item.str).join(' '));
      setDebugInfo(prev => prev + `\nExtracted ${courses.length} courses.`);

      const totalAttemptedCredits = courses.reduce((sum, course) => sum + course.attempted, 0);
      const totalEarnedCredits = courses.reduce((sum, course) => sum + course.earned, 0);
      const totalGPAUnits = courses.reduce((sum, course) => 
        course.grade !== 'P' && course.grade !== 'NP' && course.grade !== 'W' ? sum + course.attempted : sum, 0);
      const totalGradePoints = courses.reduce((sum, course) => sum + course.points, 0);
      const cumulativeGPA = calculateGPA(courses);

      const quarterlyGPA = calculateQuarterlyGPA(courses);

      setParsedData({
        courses,
        totalAttemptedCredits,
        totalEarnedCredits,
        totalGPAUnits,
        totalGradePoints,
        cumulativeGPA,
        quarterlyGPA
      });

      setDebugInfo(prev => prev + '\nFinished parsing data.');
    } catch (err) {
      console.error('PDF parsing error:', err);
      setError(`Error parsing PDF: ${err instanceof Error ? err.message : String(err)}`);
      setDebugInfo(prev => prev + `\nError occurred: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const processLine = (line: string, courses: Course[], currentQuarter: string) => {
    const courseMatch = line.trim().match(/^(\w+)\s+(\d+\w*)\s+(.*?)\s+([\d.]+)\s+([\d.]+)\s+([A-F][+-]?|P|NP|W)\s+/);
    if (courseMatch && currentQuarter) {
      const attempted = parseFloat(courseMatch[4]);
      const grade = courseMatch[6];
      const gradeValue = getGradeValue(grade);
      const points = attempted * gradeValue;
      
      courses.push({
        quarter: currentQuarter,
        name: `${courseMatch[1]} ${courseMatch[2]}`,
        description: courseMatch[3].trim(),
        attempted: attempted,
        earned: parseFloat(courseMatch[5]),
        grade: grade,
        points: points
      });
    }
  };

  const calculateQuarterlyGPA = (courses: Course[]): { quarter: string; GPA: number }[] => {
    const quarterlyData: { [key: string]: { totalPoints: number; totalUnits: number } } = {};

    courses.forEach(course => {
      if (course.grade !== 'P' && course.grade !== 'NP' && course.grade !== 'W') {
        if (!quarterlyData[course.quarter]) {
          quarterlyData[course.quarter] = { totalPoints: 0, totalUnits: 0 };
        }
        quarterlyData[course.quarter].totalPoints += course.points;
        quarterlyData[course.quarter].totalUnits += course.attempted;
      }
    });

    return Object.entries(quarterlyData)
      .map(([quarter, data]) => ({
        quarter,
        GPA: data.totalUnits > 0 ? data.totalPoints / data.totalUnits : 0
      }))
      .sort((a, b) => {
        const [yearA, quarterA] = a.quarter.split(' ');
        const [yearB, quarterB] = b.quarter.split(' ');
        return yearA.localeCompare(yearB) || quarterOrder.indexOf(quarterA) - quarterOrder.indexOf(quarterB);
      });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setError(null);
      setDebugInfo('');
      setRawText('');
      setParsedData(null);
      parsePDF(file);
    }
  };

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    const file = e.dataTransfer.files[0];
    if (file && file.type === 'application/pdf') {
      setError(null);
      setDebugInfo('');
      setRawText('');
      setParsedData(null);
      parsePDF(file);
    } else {
      setError('Please drop a PDF file.');
    }
  };

  const quarters = useMemo(() => {
    return parsedData ? Array.from(new Set(parsedData.courses.map(course => course.quarter))).sort() : [];
  }, [parsedData]);

  const calculateSelectedGPA = useCallback(() => {
    if (!parsedData || !startQuarter || !endQuarter) return null;

    const startIndex = quarters.indexOf(startQuarter);
    const endIndex = quarters.indexOf(endQuarter);

    if (startIndex === -1 || endIndex === -1 || startIndex > endIndex) return null;

    const selectedQuarters = quarters.slice(startIndex, endIndex + 1);
    const selectedCourses = parsedData.courses.filter(course => selectedQuarters.includes(course.quarter));

    return calculateGPA(selectedCourses);
  }, [parsedData, startQuarter, endQuarter, quarters]);

  return (
    <div style={{ 
      maxWidth: '1200px', 
      margin: '0 auto', 
      padding: '20px', 
      fontFamily: 'Arial, sans-serif',
      backgroundColor: '#1e1e1e',
      color: '#e0e0e0',
      minHeight: '100vh'
    }}>
      <h1 style={{ textAlign: 'center', color: '#9c27b0' }}>Transcript Dashboard</h1>
      
      <div style={{ marginBottom: '20px' }}>
        <button 
          onClick={() => setShowInstructions(!showInstructions)}
          style={{
            backgroundColor: '#9c27b0',
            color: '#1e1e1e',
            border: 'none',
            padding: '10px 15px',
            borderRadius: '5px',
            cursor: 'pointer'
          }}
        >
          {showInstructions ? 'Hide Instructions' : 'Show Instructions'}
        </button>
        {showInstructions && (
          <div style={{ 
            backgroundColor: '#2c2c2c', 
            padding: '15px', 
            borderRadius: '5px', 
            marginTop: '10px' 
          }}>
            <h3>How to Use This App:</h3>
            <ol>
              <li>Upload your transcript PDF using the file input below or drag and drop a file.</li>
              <li>The app will parse your transcript and display your courses and GPA information.</li>
              <li>You can calculate your GPA for specific quarter ranges using the dropdown menus.</li>
            </ol>
            <h3>How Calculations Are Made:</h3>
            <ul>
              <li>GPA is calculated by dividing total grade points by total GPA units.</li>
              <li>Grade points are calculated by multiplying the course units by the grade value (A = 4.0, B = 3.0, etc.).</li>
              <li>Courses with P/NP or W grades are not included in GPA calculations.</li>
              <li>Quarterly GPA is calculated using only the courses from that specific quarter.</li>
            </ul>
          </div>
        )}
      </div>

      <div 
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{
          border: `2px dashed ${isDragging ? '#9c27b0' : '#4a4a4a'}`,
          borderRadius: '5px',
          padding: '20px',
          textAlign: 'center',
          cursor: 'pointer',
          marginBottom: '20px'
        }}
      >
        <input 
          type="file" 
          accept=".pdf" 
          onChange={handleFileChange} 
          style={{ display: 'none' }}
          id="file-input"
        />
        <label htmlFor="file-input" style={{ cursor: 'pointer' }}>
          {isDragging ? 'Drop the PDF file here' : 'Click to upload or drag and drop a PDF file here'}
        </label>
      </div>
      
      {error && <p style={{ color: '#ff6b6b' }}>{error}</p>}
      
      {parsedData && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <div style={{ backgroundColor: '#2c2c2c', padding: '20px', borderRadius: '8px' }}>
            <h2 style={{ color: '#9c27b0', marginTop: '0' }}>Overall Statistics</h2>
            <p>Total Attempted Credits: {parsedData.totalAttemptedCredits.toFixed(2)}</p>
            <p>Total Earned Credits: {parsedData.totalEarnedCredits.toFixed(2)}</p>
            <p>Total GPA Units: {parsedData.totalGPAUnits.toFixed(2)}</p>
            <p>Total Grade Points: {parsedData.totalGradePoints.toFixed(2)}</p>
            <p>Cumulative GPA: {parsedData.cumulativeGPA.toFixed(2)}</p>
          </div>
          
          <div style={{ backgroundColor: '#2c2c2c', padding: '20px', borderRadius: '8px' }}>
            <h2 style={{ color: '#9c27b0', marginTop: '0' }}>Calculate GPA for Specific Quarters</h2>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
              <select 
                value={startQuarter} 
                onChange={(e) => setStartQuarter(e.target.value)}
                style={{ padding: '5px', width: '45%', backgroundColor: '#1e1e1e', color: '#e0e0e0', border: '1px solid #9c27b0' }}
              >
                <option value="">Select Start Quarter</option>
                {quarters.map(q => <option key={q} value={q}>{q}</option>)}
              </select>
              <select 
                value={endQuarter} 
                onChange={(e) => setEndQuarter(e.target.value)}
                style={{ padding: '5px', width: '45%', backgroundColor: '#1e1e1e', color: '#e0e0e0', border: '1px solid #9c27b0' }}
              >
                <option value="">Select End Quarter</option>
                {quarters.map(q => <option key={q} value={q}>{q}</option>)}
              </select>
            </div>
            {startQuarter && endQuarter && (
              <p>Selected GPA: {calculateSelectedGPA()?.toFixed(2) || 'N/A'}</p>
            )}
          </div>

          <div style={{ gridColumn: '1 / -1', backgroundColor: '#2c2c2c', padding: '20px', borderRadius: '8px' }}>
            <h2 style={{ color: '#9c27b0', marginTop: '0' }}>Quarterly GPA Trend</h2>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={parsedData.quarterlyGPA}>
                <CartesianGrid strokeDasharray="3 3" stroke="#4a4a4a" />
                <XAxis dataKey="quarter" stroke="#e0e0e0" />
                <YAxis domain={[0, 4]} stroke="#e0e0e0" />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1e1e1e', border: '1px solid #9c27b0' }}
                  labelStyle={{ color: '#9c27b0' }}
                />
                <Legend />
                <Line type="monotone" dataKey="GPA" stroke="#9c27b0" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div style={{ gridColumn: '1 / -1', overflowX: 'auto' }}>
            <h2 style={{ color: '#9c27b0' }}>Courses ({parsedData.courses.length})</h2>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '10px' }}>
              <thead>
                <tr style={{ backgroundColor: '#2c2c2c' }}>
                  <th style={tableHeaderStyle}>Quarter</th>
                  <th style={tableHeaderStyle}>Course</th>
                  <th style={tableHeaderStyle}>Description</th>
                  <th style={tableHeaderStyle}>Attempted</th>
                  <th style={tableHeaderStyle}>Earned</th>
                  <th style={tableHeaderStyle}>Grade</th>
                  <th style={tableHeaderStyle}>Points</th>
                </tr>
              </thead>
              <tbody>
                {parsedData.courses.map((course, index) => (
                  <tr key={index} style={{ backgroundColor: index % 2 === 0 ? '#1e1e1e' : '#2c2c2c' }}>
                    <td style={tableCellStyle}>{course.quarter}</td>
                    <td style={tableCellStyle}>{course.name}</td>
                    <td style={tableCellStyle}>{course.description}</td>
                    <td style={tableCellStyle}>{course.attempted}</td>
                    <td style={tableCellStyle}>{course.earned}</td>
                    <td style={tableCellStyle}>{course.grade}</td>
                    <td style={tableCellStyle}>{course.points.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div style={{ marginTop: '20px', whiteSpace: 'pre-wrap' }}>
        <h3 style={{ color: '#9c27b0' }}>Debug Information:</h3>
        <pre style={{ backgroundColor: '#2c2c2c', padding: '10px', borderRadius: '4px', overflowX: 'auto' }}>{debugInfo}</pre>
      </div>

      <div style={{ marginTop: '20px', whiteSpace: 'pre-wrap' }}>
        <h3 style={{ color: '#9c27b0' }}>Raw Text Content:</h3>
        <pre style={{ maxHeight: '400px', overflow: 'auto', backgroundColor: '#2c2c2c', padding: '10px', borderRadius: '4px' }}>
          {rawText}
        </pre>
      </div>
    </div>
  );
};

const tableHeaderStyle: React.CSSProperties = {
  padding: '10px',
  borderBottom: '2px solid #9c27b0',
  textAlign: 'left',
  color: '#9c27b0'
};

const tableCellStyle: React.CSSProperties = {
  padding: '8px',
  borderBottom: '1px solid #4a4a4a'
};

export default App;