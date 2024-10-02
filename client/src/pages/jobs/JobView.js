import React, { useEffect, useState } from "react";
import axios from "axios";
import Navbar from "../../components/layout/Navbar";
import Footer from "../../components/layout/Footer";
import { useAuth } from "../../context/AuthContext";
import Modal from "react-modal";
import { useNavigate, useParams } from "react-router-dom";
import "../../styles/job/JobView.css";
import Spinner from "../../components/Spinner/Spinner";
import {
  FaMapMarkerAlt,
  FaMoneyBillWave,
  FaCalendarAlt,
  FaClock,
  FaBriefcase,
} from "react-icons/fa";
import "react-datepicker/dist/react-datepicker.css";

const JobView = () => {
  const { _id } = useParams(); // Extract the job ID from the URL
  const { isAuthenticated, logout, user, isJobSeeker } = useAuth(); // Grab authentication details from context
  const [hasProfile, setHasProfile] = useState(false); // State to track if user has a profile
  const [confirmationModalIsOpen, setConfirmationModalIsOpen] = useState(false); // State to manage modal visibility
  const navigate = useNavigate(); // Hook to navigate programmatically
  const [loading, setLoading] = useState(true); // State to manage loading status

  // State to hold job details
  const [job, setJob] = useState({
    employer: "",
    title: "",
    description: "",
    company: "",
    location: "",
    jobCategory: "",
    requirements: [],
    benefits: [],
    salaryRange: "",
    employmentType: "",
    applicationDeadline: new Date(),
    status: "",
    datePosted: "",
  });

  const [hasApplied, setHasApplied] = useState(false); // Track if the user has applied

  // Fetch job details on component mount
  useEffect(() => {
    const fetchJob = async () => {
      try {
        const response = await axios.get(
          `http://localhost:5050/api/jobs/${_id}`
        );
        setJob(response.data);

        if (isAuthenticated && user) {
          // Check if the user has already applied for this job
          const applicationResponse = await axios.get(
            `http://localhost:5050/api/application/check`,
            {
              params: {
                jobId: _id,
                userId: user._id,
              },
            }
          );
          setHasApplied(applicationResponse.data.hasApplied);

          // Check if the user has a profile
          const profileResponse = await axios.get(
            `http://localhost:5050/api/profile/fetch/`,
            { withCredentials: true } // Ensure credentials (cookies) are included in request
          );

          // Update profile existence state based on response
          setHasProfile(profileResponse.data.profileExists);
        }

        setLoading(false);
      } catch (err) {
        setLoading(false);
        console.error(err);
      }
    };

    fetchJob();
  }, [_id, isAuthenticated, user]);

  if (loading) return <Spinner />; // Show loading spinner while data is being fetched
  if (!job)
    // If job data isn't found
    return (
      <div>
        <h1 className="lrg-heading">Job Not Found</h1>{" "}
        {/* Display not found message */}
      </div>
    );

  // Calculate how many days ago the job was posted
  const daysAgo = Math.floor(
    (new Date() - new Date(job.datePosted)) / (1000 * 60 * 60 * 24)
  );

  // Handle user logout
  const handleLogout = () => {
    logout(); // Call logout function
    navigate("/"); // Redirect to home page
  };

  const openConfirmationModal = () => {
    setConfirmationModalIsOpen(true); // Open the confirmation modal
  };

  const closeConfirmationModal = () => setConfirmationModalIsOpen(false); // Close the modal

  const handleApply = async () => {
    try {
      // Send application request
      await axios.post(`http://localhost:5050/api/application/`, {
        jobId: _id,
        userId: user._id,
      });
      setHasApplied(true); // Update applied status
      navigate("/dashboard"); // Redirect to dashboard
    } catch (err) {
      closeConfirmationModal(); // Close modal on error
    }
  };

  return (
    <div>
      <Navbar isAuthenticated={isAuthenticated} handleLogout={handleLogout} />
      <div className="content">
        <h1 className="lrg-heading">Job Listing</h1>
        <div className="job-details-container">
          <div className="job-header">
            <h2>{job.title}</h2>
            <p
              className="company-info hover"
              onClick={() => navigate(`/viewcompany/${job.employer}`)}
            >
              {job.company}
            </p>
          </div>

          <div className="job-icons">
            <p>
              <FaMapMarkerAlt /> {job.location}
            </p>
            <p>
              <FaMoneyBillWave /> {job.salaryRange}
            </p>
            <p>
              <FaBriefcase /> {job.jobCategory}
            </p>
            <p>
              <FaClock /> {job.employmentType}
            </p>
            <p>
              <FaCalendarAlt /> Application Deadline:{" "}
              {new Date(job.applicationDeadline).toLocaleDateString()}
            </p>
            <p>
              {daysAgo === 0 ? "Posted Today" : `Posted ${daysAgo} days ago`}
            </p>

            {isAuthenticated ? (
              hasProfile ? (
                isJobSeeker() && job.status === "Open" && !hasApplied ? (
                  <div className="apply-button-container">
                    <button
                      className="btn"
                      onClick={() => openConfirmationModal(true)}
                    >
                      Quick Apply
                    </button>
                  </div>
                ) : hasApplied ? (
                  <p className="applied-notification">
                    You have already applied for this job.
                  </p>
                ) : (
                  <p className="status-notification">
                    This job is currently not accepting applications.
                  </p>
                )
              ) : (
                <p className="profile-notification">
                  You need to complete your profile before applying.
                </p>
              )
            ) : (
              <div className="login-prompt-container">
                <button className="btn" onClick={() => navigate("/login")}>
                  Login to Apply
                </button>
              </div>
            )}
          </div>
          <div className="job-description">
            <h3>Description</h3>
            <pre className="job-description">{job.description}</pre>
          </div>

          <div className="job-requirements">
            <h3>Requirements</h3>
            <ul>
              {job.requirements.map((req, index) => (
                <li key={index}>
                  <p>{req}</p>
                </li>
              ))}
            </ul>
          </div>

          <div className="job-benefits">
            <h3>Benefits</h3>
            <ul>
              {job.benefits.map((benefit, index) => (
                <li key={index}>
                  <p>{benefit}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
      {/* Confirmation Modal */}
      <Modal
        isOpen={confirmationModalIsOpen}
        onRequestClose={closeConfirmationModal}
        className="modal-wrapper"
      >
        <div className="modal">
          <h1 className="lrg-heading">Confirm Application</h1>
          <p className="med-text">
            By applying to this job, the employer can see your profile.
          </p>
          <div className="btn-container">
            <button onClick={handleApply} className="btn-confirm">
              Confirm
            </button>
            <button onClick={closeConfirmationModal} className="btn-cancel">
              Cancel
            </button>
          </div>
        </div>
      </Modal>
      <Footer />
    </div>
  );
};

export default JobView;
