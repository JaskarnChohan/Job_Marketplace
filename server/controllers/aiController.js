const { GoogleGenerativeAI } = require("@google/generative-ai");
const Profile = require("../models/profile");
const JobListing = require("../models/jobListing");
const Experience = require("../models/experience");
const Education = require("../models/education");
const Skill = require("../models/skill");

// Initialise the Google Generative AI
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

const fs = require("fs");
const path = require("path");
const pdf = require("pdf-parse"); // For PDF files
const mammoth = require("mammoth"); // For DOCX files

// AI Improvement function
exports.improveAnswer = async (req, res) => {
  const { question, answer } = req.body;
  const userId = req.user.id;

  // Validate input
  if (!question || !answer) {
    console.log("Validation failed: Missing question or answer.");
    return res
      .status(400)
      .json({ msg: "Both question and answer are required." });
  }

  // Check if API key is set
  if (!process.env.GOOGLE_AI_API_KEY) {
    return res.status(500).json({ msg: "This feature requires AI setup." });
  }

  try {
    // Fetch user profile
    const profile = await Profile.findOne({ user: userId });

    // Initialise userInfo string
    let userInfo = "";

    // If the profile exists, fetch user information
    if (profile) {
      // Fetch experience, education, and skills separately using profileId
      const experience = await Experience.find({ profile: profile._id });
      const education = await Education.find({ profile: profile._id });
      const skills = await Skill.find({ profile: profile._id });

      // Construct the context using the profile data
      userInfo = `
        First Name: ${profile.firstName || "N/A"}
        Last Name: ${profile.lastName || "N/A"}
        Location: ${profile.location || "N/A"}
        Bio: ${profile.bio || "N/A"}
        Preferred Work Category: ${profile.preferredClassification || "N/A"}
        Experience: ${
          experience
            .map(
              (exp) =>
                `${exp.title} at ${exp.company} (${exp.startMonth} ${
                  exp.startYear
                } - ${
                  exp.endMonth ? exp.endMonth + " " + exp.endYear : "Present"
                })<br>Description: ${exp.description || "N/A"}`
            )
            .join(", ") || "N/A"
        }
        Education: ${
          education
            .map(
              (edu) =>
                `${edu.degree} in ${edu.fieldOfStudy} from ${edu.school} (
                  ${edu.startMonth} ${edu.startYear} - ${
                  edu.endMonth ? edu.endMonth + " " + edu.endYear : "Present"
                })<br>Description: ${edu.description || "N/A"}`
            )
            .join(", ") || "N/A"
        }
        Skills: ${
          skills
            .map(
              (skill) =>
                `${skill.name} (Level: ${skill.level}, Description: ${skill.description})`
            )
            .join(", ") || "N/A"
        }
      `;
    }

    // Create the prompt for the AI
    const prompt = `You are an expert in helping individuals articulate their responses more effectively. As part of a tool on a job marketplace website, your role is to assist job seekers in enhancing their answers to interview questions.

    Your response should:
    1. Use user information to provide more personalized and relevant suggestions.
    2. Be formatted in HTML to maintain a clean and user-friendly UI. Use <strong> for emphasis instead of * and <em> for italics. Ensure that your exact response is in HTML format.
    3. Include spaces between paragraphs for better readability.
    4. Provide feedback on the original answer.
    5. Suggest points for improvement before presenting the improved answer.
    6. Improve the following answer by making it more detailed and engaging while preserving the essence of the original content.
    7. Avoid generating irrelevant or AI-like content that may detract from the user's experience.

    ${userInfo ? `**User Info:** ${userInfo}` : ""}
    
    **Question:** ${question} 
    
    **Answer:** ${answer} 
    
    **Response Format:**
    <response>
      <h3>Feedback</h3>
      <p className="sub-headings"><!-- Your feedback here --></p>
      <br>
      <h3>Points for Improvement</h3>
      <p><!-- Your points for improvement here --></p>
      <br>
      <h3>Improved Answer</h3>
      <p className="sub-headings"><!-- Your improved answer here --></p>
    </response>
    `;

    // Generate improved content using the Gemini API
    const result = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        maxOutputTokens: 1000, // Maximum number of tokens to generate
        temperature: 0.7,
      },
    });

    // Check the candidates array
    if (result?.response?.candidates && result.response.candidates.length > 0) {
      const improvedText = result.response.candidates[0].content.parts[0].text;

      // If no improved text is returned
      if (!improvedText) {
        console.log("AI response did not contain improved text.");
        return res
          .status(500)
          .json({ msg: "Failed to retrieve improved text from the AI." });
      }

      // Send the improved text in response
      return res.json({ improvedText });
    } else {
      console.log("No candidates found in AI response.");
      return res
        .status(500)
        .json({ msg: "No candidates found in AI response." });
    }
  } catch (err) {
    console.error("Error during AI request:", err.message);
    res
      .status(500)
      .json({ msg: "Error improving question/answer", error: err.message });
  }
};

// AI Evaluation function
exports.evaluateApplication = async (application) => {
  const { userId, jobId, questions } = application;

  // Skip evaluation if there are no questions
  if (!questions || questions.length === 0) {
    return {
      score: "N/A",
      evaluation: "No questions provided for evaluation.",
      recommendedOutcome: "N/A",
    };
  }

  // Fetch job details using jobId
  const jobDetails = await JobListing.findById(jobId);
  if (!jobDetails) {
    throw new Error("Job not found");
  }

  // Fetch user profile
  const profile = await Profile.findOne({ user: userId });
  let userInfo = "";

  // If the profile exists, fetch user information
  if (profile) {
    // Fetch experience, education, and skills separately using profileId
    const experience = await Experience.find({ profile: profile._id });
    const education = await Education.find({ profile: profile._id });
    const skills = await Skill.find({ profile: profile._id });

    // Construct the context using the profile data
    userInfo = `
        First Name: ${profile.firstName || "N/A"}
        Last Name: ${profile.lastName || "N/A"}
        Location: ${profile.location || "N/A"}
        Bio: ${profile.bio || "N/A"}
        Preferred Work Category: ${profile.preferredClassification || "N/A"}
        Experience: ${
          experience
            .map(
              (exp) =>
                `${exp.title} at ${exp.company} (${exp.startMonth} ${
                  exp.startYear
                } - ${
                  exp.endMonth ? exp.endMonth + " " + exp.endYear : "Present"
                })\nDescription: ${exp.description || "N/A"}`
            )
            .join(", ") || "N/A"
        }
        Education: ${
          education
            .map(
              (edu) =>
                `${edu.degree} in ${edu.fieldOfStudy} from ${edu.school} (${
                  edu.startMonth
                } ${edu.startYear} - ${
                  edu.endMonth ? edu.endMonth + " " + edu.endYear : "Present"
                })\nDescription: ${edu.description || "N/A"}`
            )
            .join(", ") || "N/A"
        }
        Skills: ${
          skills
            .map(
              (skill) =>
                `${skill.name} (Level: ${skill.level}, Description: ${skill.description})`
            )
            .join(", ") || "N/A"
        }
      `;
  }

  // Create the prompt for the AI
  const prompt = `You are an expert in evaluating job applications based on job descriptions and applicant answers. Your task is to assess whether the applicant is a good fit for the job.
      
      Your response should:
      1. Use job details and user information to provide a personalized evaluation.
      2. Be formatted as plain text, with no HTML or special formatting.
      3. Provide feedback on all the applicant's answers.
      4. Evaluate all the answers and provide a score out of 100.
      5. Recommend outcomes based on the evaluation.
  
      **Job Details:**
      Title: ${jobDetails.title}
      Description: ${jobDetails.description}
      Requirements: ${jobDetails.requirements.join(", ") || "N/A"}
      Benefits: ${jobDetails.benefits.join(", ") || "N/A"}
      Salary Range: ${jobDetails.salaryRange}
      Employment Type: ${jobDetails.employmentType}
      Location: ${jobDetails.location}
  
      ${userInfo ? `**User Info:** ${userInfo}` : ""}
  
      **Questions and Answers:**
      ${questions
        .map((q) => `Question: ${q.question}\nAnswer: ${q.userAnswer}\n`)
        .join("")}
  
      **Response Format:**
      <response>
        Score: <score>/100 <!-- Ensure you do the score out of 100. -->
        Feedback: <!-- Your feedback here -->
        Recommended Outcome: Accepted | Rejected | Interview | Wait<!-- Ensure the response matches these values -->
      </response>
      `;

  // Generate evaluation content using the AI model
  const result = await model.generateContent({
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }],
      },
    ],
    generationConfig: {
      maxOutputTokens: 1000, // Maximum number of tokens to generate
      temperature: 0.7,
    },
  });

  // Check the candidates array
  if (result?.response?.candidates && result.response.candidates.length > 0) {
    const evaluationText = result.response.candidates[0].content.parts[0].text;

    // If no evaluation text is returned
    if (!evaluationText) {
      throw new Error("AI response did not contain evaluation text.");
    }

    // Split evaluation text to extract score, feedback, and recommended outcome
    const responseRegex =
      /Score:\s*(\d+)\/100\s*Feedback:\s*(.*?)\s*Recommended Outcome:\s*(Accepted|Rejected|Interview|Wait)/s;
    const matches = evaluationText.match(responseRegex);

    if (!matches) {
      throw new Error("AI response did not match expected format.");
    }

    const score = matches[1]; // Extract score
    const feedback = matches[2]; // Extract feedback
    const recommendedOutcome = matches[3]; // Extract recommended outcome

    return {
      score: `${score}/100`,
      evaluation: feedback,
      recommendedOutcome,
    };
  } else {
    throw new Error("No candidates found in AI response.");
  }
};

exports.evaluateResume = async (req, res) => {
  const userId = req.params.userId;

  try {
    // Fetch user profile to get the resume path
    const profile = await Profile.findOne({ user: userId }).select("resume");

    // Check if the resume path is available
    if (!profile || !profile.resume) {
      return res.status(404).json({ msg: "Resume not found." });
    }

    // Path to the uploaded resume file
    const resumeFilePath = path.join("./", profile.resume);

    // Check if the file exists
    if (!fs.existsSync(resumeFilePath)) {
      return res
        .status(404)
        .json({ msg: "Resume file not found on the server." });
    }

    let resumeContent = "";

    // Determine file type and read content accordingly
    if (resumeFilePath.endsWith(".pdf")) {
      const dataBuffer = fs.readFileSync(resumeFilePath);
      const data = await pdf(dataBuffer);
      resumeContent = data.text;
    } else if (resumeFilePath.endsWith(".docx")) {
      const data = await mammoth.extractRawText({ path: resumeFilePath });
      resumeContent = data.value; // The raw text
    } else if (resumeFilePath.endsWith(".doc")) {
      return res.status(400).json({ msg: "DOC file format is not supported." });
    } else {
      return res.status(400).json({ msg: "Unsupported file format." });
    }

    // Prompt to correct the CV
    const correctionPrompt = `
        You are a professional resume editor. Your task is to correct any spelling mistakes, grammar errors, typos, and clarify any ambiguous wording related to degrees or certifications in the following resume content.
  
        **Resume Content:** ${resumeContent}
  
        **Response Format:**
        <correctedResume>
          <!-- Provide the corrected resume text here. -->
        </correctedResume>
      `;

    // Generate corrected content using the AI model
    const correctionResult = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [{ text: correctionPrompt }],
        },
      ],
      generationConfig: {
        maxOutputTokens: 1000,
        temperature: 0.7,
      },
    });

    console.log(
      "Correction AI response:",
      JSON.stringify(correctionResult, null, 2)
    );

    // Check for the corrected resume
    if (
      correctionResult?.response?.candidates &&
      correctionResult.response.candidates.length > 0
    ) {
      const correctedResumeText =
        correctionResult.response.candidates[0].content.parts[0].text;

      if (!correctedResumeText) {
        console.log(
          "Correction AI response did not contain corrected resume text."
        );
        return res
          .status(500)
          .json({ msg: "Failed to retrieve corrected resume text." });
      }

      // Now, create the analysis prompt using the corrected resume
      const analysisPrompt = `
      You are an employer who is going to evulate this resume to share with other employers to see if they are fit for your jobs. Your task is to provide a professional and comprehensive analysis of the following resume in terms of employers to see. Focus solely on aspects that are valuable for hiring decisions, such as relevant skills, professional experience, and achievements. **Ignore any spelling, grammar, or formatting issues.**

      **You are writing to employers and not job seekers. Don't recommend any solutions for potential concerns.**

      **Resume Content:** ${correctedResumeText}

      **Response Format:**
      <response>
        <h3>Resume Summary</h3>
        <p><!-- A clear summary of the candidate's experience, skills, and qualifications that are relevant for hiring decisions --></p>
        <br>

        <h3>Strengths</h3>
        <ul>
          <li><!-- Highlight the candidate's key strengths (e.g., skills, achievements, professional experience) that make them a strong contender for the roles they are applying for --></li>
        </ul>
        <br>

        <h3>Potential Employment Concerns</h3>
        <ul>
          <li><!-- **Identify any potential employment concerns specific to the candidate's qualifications or experience that may affect your decision as an employer on hiring this job seeker. Focus on content-related concerns that employers should know. These concerns are for employers to see on the job seeker. Don't recommend any solutions. You aren't evulating the layout of the CV but instead the content. Ignore things like formating. ** --></li>
        </ul>
        <br>

        <h3>Suggested Job Roles/Industries</h3>
        <ul>
          <li><!-- Suggest job roles or industries that align with the candidate's skills, experience, and qualifications. --></li>
        </ul>
      </response>
    `;

      // Generate analysis using the AI model
      const analysisResult = await model.generateContent({
        contents: [
          {
            role: "user",
            parts: [{ text: analysisPrompt }],
          },
        ],
        generationConfig: {
          maxOutputTokens: 1000,
          temperature: 0.7,
        },
      });

      // Check the candidates array for analysis
      if (
        analysisResult?.response?.candidates &&
        analysisResult.response.candidates.length > 0
      ) {
        const evaluationText =
          analysisResult.response.candidates[0].content.parts[0].text;

        if (!evaluationText) {
          console.log("Analysis AI response did not contain evaluation text.");
          return res
            .status(500)
            .json({ msg: "Failed to retrieve evaluation text from the AI." });
        }

        // Send the evaluation text in response
        return res.json({ evaluationText });
      } else {
        console.log("No candidates found in analysis AI response.");
        return res
          .status(500)
          .json({ msg: "No candidates found in analysis AI response." });
      }
    } else {
      console.log("No candidates found in correction AI response.");
      return res
        .status(500)
        .json({ msg: "No candidates found in correction AI response." });
    }
  } catch (err) {
    console.error("Error during resume evaluation:", err.message);
    res
      .status(500)
      .json({ msg: "Error evaluating resume", error: err.message });
  }
};

exports.feedbackResume = async (req, res) => {
  const profileId = req.params.profileId;

  try {
    // Fetch user profile to get the resume path
    const profile = await Profile.findOne({ _id: profileId }).select("resume");

    // Check if the resume path is available
    if (!profile || !profile.resume) {
      return res.status(404).json({ msg: "Resume not found." });
    }

    // Path to the uploaded resume file
    const resumeFilePath = path.join("./", profile.resume);
    console.log("resumeFilePath", resumeFilePath);

    // Check if the file exists
    if (!fs.existsSync(resumeFilePath)) {
      return res
        .status(404)
        .json({ msg: "Resume file not found on the server." });
    }

    let resumeContent = "";

    // Determine file type and read content accordingly
    if (resumeFilePath.endsWith(".pdf")) {
      const dataBuffer = fs.readFileSync(resumeFilePath);
      const data = await pdf(dataBuffer);
      resumeContent = data.text;
    } else if (resumeFilePath.endsWith(".docx")) {
      const data = await mammoth.extractRawText({ path: resumeFilePath });
      resumeContent = data.value; // The raw text
    } else if (resumeFilePath.endsWith(".doc")) {
      return res.status(400).json({ msg: "DOC file format is not supported." });
    } else {
      return res.status(400).json({ msg: "Unsupported file format." });
    }

    // Prompt to correct the CV
    const correctionPrompt = `
        You are a professional resume editor. Your task is to correct any spelling mistakes, grammar errors, typos, and clarify any ambiguous wording related to degrees or certifications in the following resume content.
  
        **Resume Content:** ${resumeContent}
  
        **Response Format:**
        <correctedResume>
          <!-- Provide the corrected resume text here. -->
        </correctedResume>
      `;

    // Generate corrected content using the AI model
    const correctionResult = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [{ text: correctionPrompt }],
        },
      ],
      generationConfig: {
        maxOutputTokens: 1000,
        temperature: 0.7,
      },
    });

    console.log(
      "Correction AI response:",
      JSON.stringify(correctionResult, null, 2)
    );

    // Check for the corrected resume
    if (
      correctionResult?.response?.candidates &&
      correctionResult.response.candidates.length > 0
    ) {
      const correctedResumeText =
        correctionResult.response.candidates[0].content.parts[0].text;

      if (!correctedResumeText) {
        console.log(
          "Correction AI response did not contain corrected resume text."
        );
        return res
          .status(500)
          .json({ msg: "Failed to retrieve corrected resume text." });
      }

      // Now, create the analysis prompt using the corrected resume
      const feedbackPrompt = `
      You are a career advisor evaluating the following resume. Provide constructive feedback to the job seeker on how they can improve their resume. Focus on the following aspects: relevance of skills, clarity of experience, alignment with job market expectations, and overall presentation. Be specific in your feedback without recommending specific changes. Do not use * but use <strong> for emphasis.

      **Resume Content:** ${correctedResumeText}

      **Response Format:**
      <response>
        <h3>Feedback Summary</h3>
        <p><!-- A summary of key points that the candidate should consider for improvement --></p>
        <br>

        <h3>Strengths</h3>
        <ul>
          <li><!-- Highlight the candidate's strengths based on their resume --></li>
        </ul>
        <br>

        <h3>Areas for Improvement</h3>
        <ul>
          <li><!-- Identify specific areas where the candidate can improve their resume (e.g., skills to highlight, experience to clarify, etc.) --></li>
        </ul>
        <br>

        <h3>Additional Suggestions</h3>
        <ul>
          <li><!-- Provide general suggestions that could enhance the resume further, such as formatting tips or ways to showcase achievements. --></li>
        </ul>
      </response>
    `;

      // Generate feedback using the AI model
      const feedbackResult = await model.generateContent({
        contents: [
          {
            role: "user",
            parts: [{ text: feedbackPrompt }],
          },
        ],
        generationConfig: {
          maxOutputTokens: 1000,
          temperature: 0.7,
        },
      });

      console.log(
        "Feedback AI response:",
        JSON.stringify(feedbackResult, null, 2)
      );

      // Check the candidates array for feedback
      if (
        feedbackResult?.response?.candidates &&
        feedbackResult.response.candidates.length > 0
      ) {
        const feedbackText =
          feedbackResult.response.candidates[0].content.parts[0].text;

        if (!feedbackText) {
          console.log("Feedback AI response did not contain feedback text.");
          return res
            .status(500)
            .json({ msg: "Failed to retrieve feedback text from the AI." });
        }

        // Send the feedback text in response
        return res.json({ feedbackText });
      } else {
        console.log("No candidates found in feedback AI response.");
        return res
          .status(500)
          .json({ msg: "No candidates found in feedback AI response." });
      }
    } else {
      console.log("No candidates found in correction AI response.");
      return res
        .status(500)
        .json({ msg: "No candidates found in correction AI response." });
    }
  } catch (err) {
    console.error("Error during resume evaluation:", err.message);
    res
      .status(500)
      .json({ msg: "Error evaluating resume", error: err.message });
  }
};

// AI Evaluation function for recommended jobs
exports.evaluateRecommendedJobs = async (
  userId,
  recommendedJobs,
  homeLocation
) => {
  // Fetch user profile
  const profile = await Profile.findOne({ user: userId });
  if (!profile) {
    throw new Error("User profile not found");
  }

  // Fetch user's experience, education, and skills
  const experience = await Experience.find({ profile: profile._id });
  const education = await Education.find({ profile: profile._id });
  const skills = await Skill.find({ profile: profile._id });

  // Create a context string from user profile
  let userInfo = `
    First Name: ${profile.firstName || "N/A"}
    Last Name: ${profile.lastName || "N/A"}
    Location: ${profile.location || "N/A"}
    Bio: ${profile.bio || "N/A"}
    Preferred Work Category: ${profile.preferredClassification || "N/A"}
    Experience: ${
      experience
        .map(
          (exp) =>
            `${exp.title} at ${exp.company} (${exp.startMonth} ${
              exp.startYear
            } - ${exp.endMonth ? exp.endMonth + " " + exp.endYear : "Present"})`
        )
        .join(", ") || "N/A"
    }
    Education: ${
      education
        .map(
          (edu) =>
            `${edu.degree} in ${edu.fieldOfStudy} from ${edu.school} (${
              edu.startMonth
            } ${edu.startYear} - ${
              edu.endMonth ? edu.endMonth + " " + edu.endYear : "Present"
            })`
        )
        .join(", ") || "N/A"
    }
    Skills: ${
      skills
        .map(
          (skill) =>
            `${skill.name} (Level: ${skill.level}, Description: ${skill.description})`
        )
        .join(", ") || "N/A"
    }
  `;

  // Loop through recommended jobs and evaluate each
  const evaluations = [];
  for (const job of recommendedJobs) {
    // Create the prompt for the AI
    const prompt = `You are an expert in evaluating job recommendations based on job descriptions and user profiles.

      Your response should:
      1. Provide a score out of 100 based on the fit between the user and the job. Example criteria include skills match, experience relevance, and location proximity.

      **Job Details:**
      Title: ${job.title}
      Description: ${job.description}
      Requirements: ${job.requirements.join(", ") || "N/A"}
      Benefits: ${job.benefits.join(", ") || "N/A"}
      Salary Range: ${job.salaryRange}
      Employment Type: ${job.employmentType}
      Location: ${job.location}

      **User Home Location:** ${homeLocation}

      ${userInfo ? `**User Info:** ${userInfo}` : ""}

      **Response Format:**
      <response>
        Score: <score>/100
      </response>
    `;

    // Generate evaluation content using the AI model
    const result = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        maxOutputTokens: 1000, // Maximum number of tokens to generate
        temperature: 0.7,
      },
    });

    // Check the candidates array
    if (result?.response?.candidates && result.response.candidates.length > 0) {
      const evaluationText =
        result.response.candidates[0].content.parts[0].text;

      // If no evaluation text is returned
      if (!evaluationText) {
        throw new Error("AI response did not contain evaluation text.");
      }

      // Extract score
      const responseRegex = /Score:\s*(\d+)\/100/s;
      const matches = evaluationText.match(responseRegex);

      if (!matches) {
        throw new Error("AI response did not match expected format.");
      }

      const score = matches[1]; // Extract score

      evaluations.push({
        jobId: job._id,
        score: Number(score), // Store score as a number for sorting
      });
    } else {
      throw new Error("No candidates found in AI response.");
    }
  }

  return evaluations; // Return evaluations for all recommended jobs
};

// AI Job Insights function for employers
exports.getJobInsights = async (req, res) => {
  const { jobTitle, location } = req.body;

  // Validate input
  if (!jobTitle || !location) {
    console.log("Validation failed: Missing job title or location.");
    return res
      .status(400)
      .json({ msg: "Both job title and location are required." });
  }

  // Check if API key is set
  if (!process.env.GOOGLE_AI_API_KEY) {
    return res.status(500).json({ msg: "This feature requires AI setup." });
  }

  try {
    // Create the prompt for the AI tailored to job insights
    const prompt = `You are an expert in providing insights to employers looking to create job listings. The user needs help crafting a detailed and competitive job description for a position. This will be displayed on a job marketplace website where employers will create their job listings.

    Your response should:
    1. Include a competitive salary range based on the location and the job title.
    2. Provide details on the typical experience required for the role, especially for the given location.
    3. Suggest key job responsibilities and the most important qualifications for the position.
    4. Provide market trends on the demand for this job title in the specified region.
    5. Offer insights on how to make the job posting stand out, including attractive benefits or perks.
    6. Format the response in HTML to maintain a user-friendly format. Do not use * at all for emphasis; use <strong> instead.
    7. Structure the response to include headings like 'Salary Range,' 'Experience Requirements,' 'Job Description,' 'Market Trends,' and 'Job Posting Tips.'
    8. Ensure that the response is detailed and informative to help employers create compelling job listings.

    **Job Title:** ${jobTitle} 
    
    **Location:** ${location} 
    
    **Response Format:**
    <response>
      <h3>Salary Range</h3>
      <p className="sub-headings"><!-- Insert salary range based on location and job title --></p>
      <br>
      <h3>Experience Requirements</h3>
      <p className="sub-headings"><!-- Insert typical experience levels for the job --></p>
      <br>
      <h3>Job Description</h3>
      <p className="sub-headings"><!-- Insert key responsibilities and qualifications --></p>
      <br>
      <h3>Market Trends</h3>
      <p className="sub-headings"><!-- Insert job market trends and demand in the region --></p>
      <br>
      <h3>Job Posting Tips</h3>
      <p className="sub-headings"><!-- Insert tips on making the job posting attractive --></p>
    </response>
    `;

    const result = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        maxOutputTokens: 1000, // Maximum number of tokens to generate
        temperature: 0.7,
      },
    });

    // Check the candidates array
    if (result?.response?.candidates && result.response.candidates.length > 0) {
      const insights = result.response.candidates[0].content.parts[0].text;

      // If no insights are returned
      if (!insights) {
        console.log("AI response did not contain job insights.");
        return res
          .status(500)
          .json({ msg: "Failed to retrieve job insights from the AI." });
      }

      // Send the insights back to the employer
      return res.json({ insights });
    } else {
      console.log("No candidates found in AI response.");
      return res
        .status(500)
        .json({ msg: "No candidates found in AI response." });
    }
  } catch (err) {
    console.error("Error during AI request:", err.message);
    res
      .status(500)
      .json({ msg: "Error retrieving job insights", error: err.message });
  }
};
